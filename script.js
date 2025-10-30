const supportedExtensions = new Set(["java", "txt", "md", "html", "css", "js"]);

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("zipInput");
const structureContainer = document.getElementById("structure");
const summaryContainer = document.getElementById("summary");

function resetView(message = "Noch keine Datei geladen.") {
    structureContainer.innerHTML = `<p class="empty-state">${message}</p>`;
    summaryContainer.textContent = "";
}

resetView();

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("is-dragging");
});

dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) {
        handleFile(file);
    }
});

fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
        handleFile(file);
        fileInput.value = "";
    }
});

async function handleFile(file) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
        resetView("Bitte lade eine ZIP-Datei hoch.");
        return;
    }

    summaryContainer.textContent = "Analysiere Archiv ...";
    structureContainer.innerHTML = "";

    try {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const analysis = await analyzeZip(zip);
        renderResults(file.name, analysis);
    } catch (error) {
        console.error(error);
        resetView("Das Archiv konnte nicht gelesen werden. Bitte versuche es erneut.");
    }
}

async function analyzeZip(zip) {
    const root = createDirectoryNode("");
    const directoryMap = new Map([["", root]]);
    let supportedFileCount = 0;
    let unsupportedFileCount = 0;
    let totalLineCount = 0;
    let totalFiles = 0;

    const entries = Object.values(zip.files);
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const normalized = entry.name.replace(/\\+/g, "/");
        const parts = normalized.split("/").filter(Boolean);
        const parentPath = parts.slice(0, -1).join("/");

        ensureDirectory(parentPath, directoryMap);
        const parentNode = directoryMap.get(parentPath ?? "");

        if (entry.dir) {
            const dirPath = parts.join("/");
            const directoryNode = ensureDirectory(dirPath, directoryMap);
            if (!parentNode.children.includes(directoryNode)) {
                parentNode.children.push(directoryNode);
            }
            continue;
        }

        const fileName = parts[parts.length - 1];
        totalFiles += 1;
        const extension = extractExtension(fileName);
        let lineCount = null;
        let supported = false;

        if (supportedExtensions.has(extension)) {
            supported = true;
            const content = await entry.async("text");
            lineCount = countLines(content);
            supportedFileCount += 1;
            totalLineCount += lineCount;
        } else {
            unsupportedFileCount += 1;
        }

        const fileNode = {
            type: "file",
            name: fileName,
            path: normalized,
            extension,
            lineCount,
            supported,
        };

        parentNode.children.push(fileNode);
    }

    sortTree(root);

    return {
        root,
        supportedFileCount,
        unsupportedFileCount,
        totalLineCount,
        totalFiles,
    };
}

function ensureDirectory(path, directoryMap) {
    if (!path) {
        return directoryMap.get("");
    }

    if (directoryMap.has(path)) {
        return directoryMap.get(path);
    }

    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parentNode = ensureDirectory(parentPath, directoryMap);
    const node = createDirectoryNode(name, path);
    directoryMap.set(path, node);
    parentNode.children.push(node);
    return node;
}

function createDirectoryNode(name, path = "") {
    return {
        type: "directory",
        name: name || "<Wurzel>",
        path,
        children: [],
    };
}

function sortTree(node) {
    if (!node?.children) return;

    node.children.sort((a, b) => {
        if (a.type === b.type) {
            return a.name.localeCompare(b.name);
        }
        return a.type === "directory" ? -1 : 1;
    });

    for (const child of node.children) {
        sortTree(child);
    }
}

function extractExtension(filename) {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : "";
}

function countLines(content) {
    if (!content) return 0;
    const normalized = content.replace(/\r\n?/g, "\n");
    return normalized.split("\n").length;
}

function renderResults(fileName, analysis) {
    const {
        root,
        supportedFileCount,
        unsupportedFileCount,
        totalLineCount,
        totalFiles,
    } = analysis;
    summaryContainer.innerHTML = `
        <strong>${fileName}</strong><br>
        ${totalFiles} Datei(en) gesamt &bull; ${supportedFileCount} unterstützt &bull; ${unsupportedFileCount} nicht unterstützt.<br>
        Insgesamt ${totalLineCount.toLocaleString()} Zeilen in unterstützten Dateien.
    `;

    structureContainer.innerHTML = "";
    const treeElement = document.createElement("ul");
    treeElement.classList.add("tree");
    treeElement.setAttribute("role", "group");

    for (const child of root.children) {
        treeElement.appendChild(renderNode(child));
    }

    if (!root.children.length) {
        structureContainer.innerHTML = '<p class="empty-state">Keine Dateien im Archiv gefunden.</p>';
    } else {
        structureContainer.appendChild(treeElement);
    }
}

function renderNode(node) {
    const li = document.createElement("li");
    li.classList.add(node.type);
    li.setAttribute("role", node.type === "directory" ? "treeitem" : "none");

    const label = document.createElement("span");
    label.textContent = node.name;
    li.appendChild(label);

    if (node.type === "directory") {
        if (node.children.length) {
            const nestedList = document.createElement("ul");
            nestedList.classList.add("tree");
            nestedList.setAttribute("role", "group");

            for (const child of node.children) {
                nestedList.appendChild(renderNode(child));
            }

            li.appendChild(nestedList);
        }
    } else {
        const badge = document.createElement("span");
        badge.classList.add("badge");

        if (node.supported) {
            badge.textContent = `${node.lineCount.toLocaleString()} Zeilen`;
        } else {
            badge.textContent = "Nicht unterstützt";
            badge.classList.add("unsupported");
        }

        li.appendChild(badge);
    }

    return li;
}