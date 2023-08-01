import JSZip from 'jszip';
import log from './log';

/**
 * Deletes all data created by the old and buggy version of restore points.
 * Old data is simply not worth migrating, especially as accessing this data is prone to cause crashes
 * to due indexed DB not handling large data very well.
 */
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

/**
 * @typedef Manifest
 * @property {{id: string; title: string; assets: string[]}[]} restorePoints
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

const getDirectories = async () => {
    const root = await navigator.storage.getDirectory();
    const subdirectory = await root.getDirectoryHandle(ROOT_DIRECTORY, {
        create: true
    });
    const projects = await subdirectory.getDirectoryHandle(PROJECT_DIRECTORY, {
        create: true
    });
    const assets = await subdirectory.getDirectoryHandle(ASSET_DIRECTORY, {
        create: true
    });
    return {
        root: subdirectory,
        projects,
        assets
    };
};

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
 * @param {string} name the name of the file
 * @param {Uint8Array} data the contents to write
 */
const writeToFile = async (directory, name, data) => {
    const fileHandle = await directory.getFileHandle(name, {
        create: true
    });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
};

/**
 * @param {FileSystemDirectoryHandle} directory the directory
 * @param {string} name the name of the file
 */
const deleteFile = async (directory, name) => {
    await directory.removeEntry(name);
};

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
 * @param {Manifest} obj unknown object
 * @returns {boolean} true if obj is manifest
 */
const isValidManifest = obj => Array.isArray(obj.restorePoints) && obj.restorePoints.every(point => (
    typeof point.id === 'string' &&
    typeof point.title === 'string' &&
    Array.isArray(point.assets) &&
    point.assets.every(asset => typeof asset === 'string')
));

/**
 * @param {FileSystemDirectoryHandle} root the root restore point directory
 * @returns {Promise<Manifest>} Parsed or default manifest
 */
const readManifest = async () => {
    try {
        const directories = await getDirectories();
        const file = await readFile(directories.root, MANIFEST_NAME);
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (isValidManifest(parsed)) {
            return parsed;
        }
    } catch (e) {
        // ignore
    }
    return {
        restorePoints: []
    };
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
 * @param {Manifest} manifest the manifest
 */
const removeExtraneous = async manifest => {
    const directories = await getDirectories();

    const expectedProjectFiles = manifest.restorePoints.map(i => `${i.id}.json`);
    const allSavedProjects = await readDirectory(directories.projects);
    const projectFilesToDelete = allSavedProjects.filter(i => !expectedProjectFiles.includes(i));
    for (const projectFile of projectFilesToDelete) {
        await deleteFile(directories.projects, projectFile);
    }

    const expectedAssetFiles = uniques(manifest.restorePoints.map(i => i.assets).flat());
    const allSavedAssets = await readDirectory(directories.assets);
    const assetsToDelete = allSavedAssets.filter(i => !expectedAssetFiles.includes(i));
    for (const assetName of assetsToDelete) {
        await deleteFile(directories.assets, assetName);
    }
};

/**
 * @param {VirtualMachine} vm scratch-vm instance
 * @param {string} title project title
 */
const createRestorePoint = async (vm, title) => {
    const directories = await getDirectories();

    const id = `${Date.now()}-${Math.round(Math.random() * 1000)}`;

    /** @type {Record<string, Uint8Array>} */
    const projectFiles = vm.saveProjectSb3DontZip();
    const projectAssets = Object.keys(projectFiles).filter(i => i !== 'project.json');

    const manifest = await readManifest(directories.root);
    manifest.restorePoints.unshift({
        id,
        title,
        assets: projectAssets
    });
    while (manifest.restorePoints.length > MAX_RESTORE_POINTS) {
        manifest.restorePoints.pop();
    }
    await writeManifest(directories.root, manifest);

    const jsonData = projectFiles['project.json'];
    await writeToFile(directories.projects, `${id}.json`, jsonData);

    const alreadySavedAssets = await readDirectory(directories.assets);
    const assetsToSave = projectAssets.filter(asset => !alreadySavedAssets.includes(asset));
    for (const assetName of assetsToSave) {
        const data = projectFiles[assetName];
        await writeToFile(directories.assets, assetName, data);
    }

    await removeExtraneous(manifest);
};

/**
 * @param {string} id the restore point's ID
 */
const deleteRestorePoint = async id => {
    const directories = await getDirectories();
    const manifest = await readManifest(id);
    manifest.restorePoints = manifest.restorePoints.filter(i => i.id !== id);
    await writeManifest(directories.root, manifest);
    await removeExtraneous(manifest);
};

const deleteAllRestorePoints = async () => {
    const directories = await getDirectories();
    await directories.root.removeEntry(MANIFEST_NAME);
    await directories.root.removeEntry(PROJECT_DIRECTORY, {
        recursive: true
    });
    await directories.root.removeEntry(ASSET_DIRECTORY, {
        recursive: true
    });
};

/**
 * @param {string} id the restore point id
 * @returns {Promise<ArrayBuffer>} sb3 file
 */
const loadRestorePoint = async id => {
    const directories = await getDirectories();
    const manifest = await readManifest(directories.root);
    const manifestEntry = manifest.restorePoints.find(i => i.id === id);

    const zip = new JSZip();
    const projectFile = await readFile(directories.projects, `${id}.json`);
    zip.file('project.json', projectFile);
    for (const asset of manifestEntry.assets) {
        zip.file(asset, await readFile(directories.assets, asset));
    }

    return zip.generateAsync({
        // no reason to spend time compresing it
        type: 'arraybuffer'
    });
};

export default {
    readManifest,
    createRestorePoint,
    deleteRestorePoint,
    deleteAllRestorePoints,
    loadRestorePoint
};
