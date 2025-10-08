const { spawn } = require('node:child_process');
const path = require('node:path');
const fsPromises = require('node:fs/promises');
const pidusage = require('pidusage');

const languageConfig = {
    cpp: {
        extension: ".cpp",
        compile: (file, out) => `g++ ${file} -o ${out}`,
        run: (out) => `${out}`,
    },
    python: {
        extension: ".py",
        compile: null,
        run: (file) => `python3 ${file}.py`,
    },
    javascript: {
        extension: ".js",
        compile: null,
        run: (file) => `node ${file}`,
    },
    java: {
        extension: ".java",
        compile: (file) => `javac ${file}`,
        run: (file) => `java ${file}`,
    }
};

async function runCode(language, code, input) {
    const config = languageConfig[language];
    if(!config) throw new Error('Unsupperted language');

    const folder = path.join(__dirname, "../tmp", Date.now().toString());
    await fsPromises.mkdir(folder, {recursive: true});

    const filePath = path.join(folder, `main${config.extension}`);
    await fsPromises.writeFile(filePath, code);

    if(config.compile){
        execSync(
            config.compile(filePath,path.join(folder, "main")),
            { stdio: "ignore" }
        );
    }

    const start = performance.now();
    const output = execSync(
        config.run(path.join(folder, "main")),
        {
            input,
            timeout: 2000,
        }
    ).toString().trim();

    const end = performance.now();
    
    return { userOut: output, runtime: end - start };
}

module.exports = { runCode };