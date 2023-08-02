import JSZip from 'jszip';

// TODO
/*
const deleteLegacyData = () => {
    try {
        if (typeof indexedDB !== 'undefined') {
            const request = indexedDB.deleteDatabase('TW_AutoSave');
            request.onerror = () => {
                log.error('Error deleting legacy restore point data');
            };
        }
    } catch (e) {
        log.error('Error deleting legacy restore point data', e);
    }
};
deleteLegacyData();
*/

/**
 * @typedef Metadata
 * @property {string} title
 * @property {number} created Unix seconds
 * @property {string[]} assets md5exts
 */

const DATABASE_NAME = 'TW_RestorePoints';
const DATABASE_VERSION = 2;
const METADATA_STORE = 'meta';
const PROJECT_STORE = 'projects';
const ASSET_STORE = 'assets';

// TODO
const MAX_AUTOMATIC_RESTORE_POINTS = 5;

/** @type {IDBDatabase|null} */
let _cachedDB = null;

/**
 * @returns {Promise<IDBDatabase>} IDB database with all stores created.
 */
const openDB = () => {
    if (_cachedDB) {
        return Promise.resolve(_cachedDB);
    }

    if (typeof indexedDB === 'undefined') {
        return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            db.createObjectStore(METADATA_STORE, {
                autoIncrement: true
            });
            db.createObjectStore(PROJECT_STORE);
            db.createObjectStore(ASSET_STORE);
        };

        request.onsuccess = () => {
            _cachedDB = request.result;
            resolve(request.result);
        };

        request.onerror = () => {
            reject(new Error(`Could not open database: ${request.error}`));
        };
    });
};

/**
 * Converts a possibly unknown or corrupted object to a known-good metadata object.
 * @param {Partial<Metadata>} obj Unknown object
 * @returns {Metadata} Metadata object with ID
 */
const parseMetadata = obj => {
    // Must not throw -- always return the most salvageable object possible.
    if (!obj || typeof obj !== 'object') {
        obj = {};
    }
    obj.title = typeof obj.title === 'string' ? obj.title : '?';
    obj.created = typeof obj.created === 'number' ? obj.created : 0;
    obj.assets = Array.isArray(obj.assets) ? obj.assets : [];
    obj.assets = obj.assets.filter(i => typeof i === 'string');
    return obj;
};

/**
 * @param {IDBObjectStore} objectStore IDB object store
 * @param {Set<IDBValidKey>} keysToKeep IDB keys that should continue to exist. Type sensitive.
 * @returns {Promise<void>} Resolves when unused items have been deleted
 */
const deleteUnknownKeys = (objectStore, keysToKeep) => new Promise(resolve => {
    const keysRequest = objectStore.getAllKeys();
    keysRequest.onsuccess = async () => {
        const allKeys = keysRequest.result;

        for (const key of allKeys) {
            if (!keysToKeep.has(key)) {
                await new Promise(innerResolve => {
                    const deleteRequest = objectStore.delete(key);
                    deleteRequest.onsuccess = () => {
                        innerResolve();
                    };
                });
            }
        }

        resolve();
    };
});

/**
 * @param {IDBTransaction} transaction readwrite transaction with access to all stores
 * @returns {Promise<void>} Resolves when files have finished being removed.
 */
const removeExtraneousFiles = transaction => new Promise(resolve => {
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const projectStore = transaction.objectStore(PROJECT_STORE);
    const assetStore = transaction.objectStore(ASSET_STORE);

    const requiredProjects = new Set();
    const requiredAssetIDs = new Set();

    const request = metadataStore.openCursor();
    request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
            requiredProjects.add(cursor.key);
            const metadata = parseMetadata(cursor.value);
            for (const assetId of metadata.assets) {
                requiredAssetIDs.add(assetId);
            }
            cursor.continue();
        } else {
            deleteUnknownKeys(projectStore, requiredProjects)
                .then(() => deleteUnknownKeys(assetStore, requiredAssetIDs))
                .then(() => resolve());
        }
    };
});

/**
 * @param {VirtualMachine} vm scratch-vm instance
 * @param {string} title project title
 * @returns {Promise<void>} resolves when the restore point is created
 */
const createRestorePoint = (vm, title) => openDB().then(db => {
    /** @type {Record<string, Uint8Array>} */
    const projectFiles = vm.saveProjectSb3DontZip();
    const projectAssetIDs = Object.keys(projectFiles)
        .filter(i => i !== 'project.json');

    const transaction = db.transaction([METADATA_STORE, PROJECT_STORE, ASSET_STORE], 'readwrite');
    return new Promise((resolveTransaction, rejectTransaction) => {
        transaction.onerror = () => {
            rejectTransaction(new Error(`Transaction error: ${transaction.error}`));
        };

        let generatedId = null;

        const writeMissingAssets = async missingAssets => {
            const assetStore = transaction.objectStore(ASSET_STORE);
            for (const assetId of missingAssets) {
                await new Promise(resolveAsset => {
                    // TODO: should we insert arraybuffer or uint8array?
                    const assetDataArray = projectFiles[assetId];
                    const request = assetStore.put(assetDataArray, assetId);
                    request.onsuccess = () => {
                        resolveAsset();
                    };
                });
            }

            resolveTransaction();
        };

        const checkMissingAssets = () => {
            const assetStore = transaction.objectStore(ASSET_STORE);
            const keyRequest = assetStore.getAllKeys();
            keyRequest.onsuccess = () => {
                const savedAssets = keyRequest.result;
                const missingAssets = projectAssetIDs.filter(assetId => !savedAssets.includes(assetId));
                writeMissingAssets(missingAssets);
            };
        };

        const writeProjectJSON = () => {
            const jsonData = projectFiles['project.json'];
            const projectStore = transaction.objectStore(PROJECT_STORE);
            const request = projectStore.add(jsonData, generatedId);
            request.onsuccess = () => {
                checkMissingAssets();
            };
        };

        const writeMetadata = () => {
            /** @type {Metadata} */
            const metadata = {
                title,
                created: Math.round(Date.now() / 1000),
                assets: projectAssetIDs
            };

            const metadataStore = transaction.objectStore(METADATA_STORE);
            const request = metadataStore.add(metadata);
            request.onsuccess = () => {
                generatedId = request.result;
                writeProjectJSON();
            };
        };

        writeMetadata();
    });
});

/**
 * @param {number} id the restore point's ID
 * @returns {Promise<void>} Resovles when the restore point has been deleted.
 */
const deleteRestorePoint = id => openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction([METADATA_STORE, PROJECT_STORE, ASSET_STORE], 'readwrite');
    transaction.onerror = () => {
        reject(new Error(`Transaction error: ${transaction.error}`));
    };

    const metadataStore = transaction.objectStore(METADATA_STORE);
    const request = metadataStore.delete(id);
    request.onsuccess = () => {
        removeExtraneousFiles(transaction)
            .then(() => resolve());
    };
}));

/**
 * @returns {Promise<void>} Resolves when the database has been deleted.
 */
const deleteAllRestorePoints = () => new Promise((resolve, reject) => {
    _cachedDB = null;

    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onerror = () => {
        reject(new Error(`Database error: ${request.error}`));
    };
    request.onsuccess = () => {
        resolve();
    };
});

/**
 * @param {number} id the restore point's ID
 * @returns {Promise<ArrayBuffer>} Resolves with sb3 file
 */
const loadRestorePoint = id => openDB().then(db => new Promise((resolveTransaction, rejectTransaction) => {
    const transaction = db.transaction([METADATA_STORE, PROJECT_STORE, ASSET_STORE], 'readonly');
    transaction.onerror = () => {
        rejectTransaction(new Error(`Transaction error: ${transaction.error}`));
    };

    const zip = new JSZip();
    /** @type {Metadata} */
    let metadata;

    const generate = () => {
        resolveTransaction(zip.generateAsync({
            // Don't bother compressing it since it will be immediately decompressed
            type: 'arraybuffer'
        }));
    };

    const loadAssets = async () => {
        const assetStore = transaction.objectStore(ASSET_STORE);
        for (const assetId of metadata.assets) {
            await new Promise(resolve => {
                const request = assetStore.get(assetId);
                request.onsuccess = () => {
                    const data = request.result;
                    zip.file(assetId, data);
                    resolve();
                };
            });
        }

        generate();
    };

    const loadProjectJSON = () => {
        const projectStore = transaction.objectStore(PROJECT_STORE);
        const request = projectStore.get(id);
        request.onsuccess = () => {
            zip.file('project.json', request.result);
            loadAssets();
        };
    };

    const loadMetadata = () => {
        const metadataStore = transaction.objectStore(METADATA_STORE);
        const request = metadataStore.get(id);
        request.onsuccess = () => {
            metadata = parseMetadata(request.result);
            loadProjectJSON();
        };
    };

    loadMetadata();
}));

// eslint-disable-next-line valid-jsdoc
/**
 * @returns {Promise<Array<Metadata & {id: number}>>} List of restore points sorted newest first.
 */
const getAllRestorePoints = () => openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction([METADATA_STORE], 'readonly');
    transaction.onerror = () => {
        reject(new Error(`Transaction error: ${transaction.error}`));
    };

    /** @type {Metadata[]} */
    const restorePoints = [];

    const metadataStore = transaction.objectStore(METADATA_STORE);
    const request = metadataStore.openCursor();
    request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
            const parsed = parseMetadata(cursor.value);
            parsed.id = cursor.key;
            restorePoints.push(parsed);

            cursor.continue();
        } else {
            resolve(restorePoints);
        }
    };
}));

const loadLegacyRestorePoint = () => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('indexedDB not supported'));
        return;
    }

    const LEGACY_DATABASE_NAME = 'TW_AutoSave';
    const LEGACY_DATABASE_VERSION = 1;
    const LEGACY_STORE_NAME = 'project';

    const openRequest = indexedDB.open(LEGACY_DATABASE_NAME, LEGACY_DATABASE_VERSION);
    openRequest.onerror = () => {
        reject(new Error(`Error opening DB: ${openRequest.error}`));
    };
    openRequest.onsuccess = () => {
        const db = openRequest.result;
        if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
            reject(new Error('Object store does not exist'));
            return;
        }

        const transaction = db.transaction(LEGACY_STORE_NAME, 'readonly');
        transaction.onerror = () => {
            reject(new Error(`Transaction error: ${transaction.error}`));
        };

        const zip = new JSZip();
        const projectStore = transaction.objectStore(LEGACY_STORE_NAME);
        const cursorRequest = projectStore.openCursor();
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
                zip.file(cursor.key, cursor.value.data);
                cursor.continue();
            } else {
                const hasJSON = !!zip.file('project.json');
                if (hasJSON) {
                    resolve(zip.generateAsync({
                        type: 'arraybuffer'
                    }));
                } else {
                    reject(new Error('Could not find project.json'));
                }
            }
        };
    };
});

export default {
    getAllRestorePoints,
    createRestorePoint,
    deleteRestorePoint,
    deleteAllRestorePoints,
    loadRestorePoint,
    loadLegacyRestorePoint
};
