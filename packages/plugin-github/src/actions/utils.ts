import fs from "fs";
import path from "path";

const IGNORED_PATTERNS = [
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".vscode",
    ".idea",
    ".DS_Store",
    ".github",
    ".gitignore",
    ".npmignore",
    ".eslintrc",
    ".prettierrc",
    ".editorconfig",
    ".travis.yml",
]

export const getFileStructure = (dir: string, depth: number, repoPath: string, fileList: string[] = []) => {
    if (depth === 0) {
        return fileList;
    }
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
        if (IGNORED_PATTERNS.some(pattern => file.includes(pattern))) {
            return;
        }
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getFileStructure(filePath, depth - 1, repoPath, fileList);
        } else {
            fileList.push(path.relative(repoPath, filePath));
        }
    });
    return fileList;
};

export const convertFileStructureToText = (fileList: string[], repoPath: string) => {
    return fileList.map(file => path.relative(repoPath, file)).join("\n");
};

export const loadFiles = (repoPath: string, files: string[]) => {
    return files.map(file => {
        try {
            return {
                path: file,
                content: fs.readFileSync(path.join(repoPath, file), 'utf-8')
            };
        } catch (error) {
            console.error(`Error reading file ${file}:`, error);
            return {
                path: file,
                content: null
            };
        }
    });
};
