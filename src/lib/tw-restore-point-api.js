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
 * @typedef Manifest
 * @property {{id: string; title: string; assets: string[]; created: number}[]} restorePoints
 */

/*
Directory structure:
[*] root
    [*] restore-points.json
        {"restorePoints":[...]}
    [*] projects
        [*] 1234.json
            {"targets":[...],...}
        [*] ...
    [*] assets
        [*] 0123456789abcdef....svg
        [*] ...
*/

const ROOT_DIRECTORY = 'tw-restore-points-v2';
const MANIFEST_NAME = 'restore-points.json';
const PROJECT_DIRECTORY = 'projects';
const ASSET_DIRECTORY = 'assets';

const MAX_RESTORE_POINTS = 5;

const uniques = arr => Array.from(new Set(arr));

const isSupported = !!navigator.storage && !!navigator.storage.getDirectory;

/**
 * @returns {Promise<FileSystemDirectoryHandle>} The root directory to store all restore point data in.
 */
const getRootDirectory = async () => {
    const root = await navigator.storage.getDirectory();
    const subdirectory = await root.getDirectoryHandle(ROOT_DIRECTORY, {
        create: true
    });
    return subdirectory;
};

/**
 * @param {FileSystemDirectoryHandle} root root
 * @param {string} directoryName name of the directory
 * @returns {Promise<FileSystemDirectoryHandle>} project directory
 */
const getDirectory = (root, directoryName) => root.getDirectoryHandle(directoryName, {
    create: true
});

/**
 * @param {FileSystemDirectoryHandle} directory the directory
 * @returns {Promise<string[]>} a list of files in the directory
 */
const readDirectory = directory => new Promise((resolve, reject) => {
    /** @type {string} */
    const files = [];

    /** @type {AsyncIterator} */
    const iterator = directory.keys();

    const getNext = () => {
        iterator.next()
            .then(result => {
                if (result.done) {
                    resolve(files);
                } else {
                    files.push(result.value);
                    getNext();
                }
            })
            .catch(error => {
                reject(error);
            });
    };

    getNext();
});

/**
 * @param {FileSystemDirectoryHandle} directory the directory
 * @param {string} filename the name of the file
 * @returns {Promise<File>} file object
 */
const readFile = async (directory, filename) => {
    const fileHandle = await directory.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return file;
};

/**
 * @param {FileSystemDirectoryHandle} directory the directory
 * @param {string} filename the name of the file
 * @param {Uint8Array} data the contents to write
 */
const writeFile = async (directory, filename, data) => {
    const fileHandle = await directory.getFileHandle(filename, {
        create: true
    });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
};

/**
 * @param {FileSystemDirectoryHandle} directory the directory
 * @param {string} name the name of the file or directory to delete
 */
const deleteEntry = async (directory, name) => {
    try {
        await directory.removeEntry(name, {
            recursive: true
        });
    } catch (e) {
        if (e.name === 'NotFoundError') {
            // already deleted, can ignore
        } else {
            throw e;
        }
    }
};

/**
 * @param {Manifest} obj unknown object
 * @returns {Manifest} parsed manifest, known good format
 */
const parseManifest = obj => {
    const parsed = {
        restorePoints: Array.isArray(obj.restorePoints) ? obj.restorePoints : []
    };
    parsed.restorePoints = parsed.restorePoints.filter(point => (
        typeof point.id === 'string' &&
        typeof point.title === 'string' &&
        typeof point.created === 'number' &&
        Array.isArray(point.assets) &&
        point.assets.every(asset => typeof asset === 'string')
    ));
    return parsed;
};

/**
 * @param {FileSystemDirectoryHandle} root the root restore point directory
 * @returns {Promise<Manifest>} Parsed or default manifest
 */
const readManifest = async root => {
    try {
        const file = await readFile(root, MANIFEST_NAME);
        const text = await file.text();
        const json = JSON.parse(text);
        return parseManifest(json);
    } catch (e) {
        // ignore
    }
    return parseManifest({});
};

/**
 * @param {FileSystemDirectoryHandle} root the root restore point directory
 * @param {Manifest} manifest Manifest to write.
 */
const writeManifest = async (root, manifest) => {
    const fileHandle = await root.getFileHandle(MANIFEST_NAME, {
        create: true
    });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(manifest));
    await writable.close();
};

/**
 * @param {FileSystemDirectoryEntry} root the root directory
 * @param {Manifest} manifest the manifest
 */
const removeExtraneousFiles = async (root, manifest) => {
    const projectRoot = await getDirectory(root, PROJECT_DIRECTORY);
    const assetRoot = await getDirectory(root, ASSET_DIRECTORY);

    const expectedProjectFiles = manifest.restorePoints.map(i => `${i.id}.json`);
    const allSavedProjects = await readDirectory(projectRoot);
    for (const projectFile of allSavedProjects) {
        if (!expectedProjectFiles.includes(projectFile)) {
            await deleteEntry(projectRoot, projectFile);
        }
    }

    const expectedAssetFiles = uniques(manifest.restorePoints.map(i => i.assets).flat());
    const allSavedAssets = await readDirectory(assetRoot);
    for (const assetName of allSavedAssets) {
        if (!expectedAssetFiles.includes(assetName)) {
            await deleteEntry(assetRoot, assetName);
        }
    }
};

/**
 * @param {VirtualMachine} vm scratch-vm instance
 * @param {string} title project title
 */
const createRestorePoint = async (vm, title) => {
    const root = await getRootDirectory();
    const projectRoot = await getDirectory(root, PROJECT_DIRECTORY);
    const assetRoot = await getDirectory(root, ASSET_DIRECTORY);

    const id = `${Date.now()}-${Math.round(Math.random() * 1e5)}`;

    /** @type {Record<string, Uint8Array>} */
    const projectFiles = vm.saveProjectSb3DontZip();
    const projectAssetNames = Object.keys(projectFiles).filter(i => i !== 'project.json');

    // There's no guarantee that this code will finish all the way, so the order *does* matter.
    // The lack of significant parallelization is also intentional as we don't want to slam the
    // browser with massive amounts of data all at once, which could increase memory usage and
    // eventually causes crashes and data loss.

    // Updating manifest must happen first, otherwise this restore point will never be recognized.
    const manifest = await readManifest(root);
    manifest.restorePoints.unshift({
        id,
        title,
        created: Math.round(Date.now() / 1000),
        assets: projectAssetNames
    });
    while (manifest.restorePoints.length > MAX_RESTORE_POINTS) {
        manifest.restorePoints.pop();
    }
    await writeManifest(root, manifest);

    // Scripts are the next most important thing -- without this the assets can't be loaded.
    const jsonData = projectFiles['project.json'];
    await writeFile(projectRoot, `${id}.json`, jsonData);

    // Assets are saved next in the order the VM gives us, which we trust to be logical.
    const alreadySavedAssets = await readDirectory(assetRoot);
    for (const assetName of projectAssetNames) {
        if (!alreadySavedAssets.includes(assetName)) {
            const data = projectFiles[assetName];
            await writeFile(assetRoot, assetName, data);
        }
    }

    // Removing old data is the last priority
    await removeExtraneousFiles(root, manifest);
};

/**
 * @param {string} id the restore point's ID
 */
const deleteRestorePoint = async id => {
    const root = await getRootDirectory();
    const manifest = await readManifest(root);
    manifest.restorePoints = manifest.restorePoints.filter(i => i.id !== id);
    await writeManifest(root, manifest);
    await removeExtraneousFiles(root, manifest);
};

const deleteAllRestorePoints = async () => {
    const root = await getRootDirectory();
    await deleteEntry(root, MANIFEST_NAME);
    await deleteEntry(root, PROJECT_DIRECTORY);
    await deleteEntry(root, ASSET_DIRECTORY);
};

/**
 * @param {string} id the restore point id
 * @returns {Promise<ArrayBuffer>} sb3 file
 */
const loadRestorePoint = async id => {
    const root = await getRootDirectory();
    const projectRoot = await getDirectory(root, PROJECT_DIRECTORY);
    const assetRoot = await getDirectory(root, ASSET_DIRECTORY);

    const manifest = await readManifest(root);
    const manifestEntry = manifest.restorePoints.find(i => i.id === id);

    const zip = new JSZip();
    const projectFile = await readFile(projectRoot, `${id}.json`);
    zip.file('project.json', projectFile);
    for (const asset of manifestEntry.assets) {
        zip.file(asset, await readFile(assetRoot, asset));
    }

    return zip.generateAsync({
        // no reason to spend time compresing the zip since it will immediately be decompressed
        type: 'arraybuffer'
    });
};

const getAllRestorePoints = async () => {
    const root = await getRootDirectory();
    const manifest = await readManifest(root);
    return manifest.restorePoints;
};

const loadLegacyRestorePoint = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) {
        reject(new Error('indexedDB not supported'));
        return;
    }

    const DATABASE_NAME = 'TW_AutoSave';
    const DATABASE_VERSION = 1;
    const STORE_NAME = 'project';

    const openRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    openRequest.onerror = () => {
        reject(new Error(`Error opening DB: ${openRequest.error}`));
    };
    openRequest.onsuccess = () => {
        const db = openRequest.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            reject(new Error('Object store does not exist'));
            return;
        }

        const transaction = db.transaction(STORE_NAME, 'readonly');
        transaction.onerror = () => {
            reject(new Error(`Transaction error: ${transaction.error}`));
        };

        const zip = new JSZip();
        const projectStore = transaction.objectStore(STORE_NAME);
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
    isSupported,
    getAllRestorePoints,
    createRestorePoint,
    deleteRestorePoint,
    deleteAllRestorePoints,
    loadRestorePoint,
    loadLegacyRestorePoint
};
