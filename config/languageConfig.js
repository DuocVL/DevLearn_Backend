const languageConfig = {
    python: {
        image: 'codejudge-env', // <-- SỬ DỤNG IMAGE TÙY CHỈNH
        srcFileName: 'main.py',
        containerDir: '/app',
        compileCmd: null, // Python is interpreted
        runCmd: {
            cmd: 'python3', // <-- ĐỔI THÀNH python3
            args: ['main.py']
        }
    },
    cpp: {
        image: 'codejudge-env', // <-- SỬ DỤNG IMAGE TÙY CHỈNH
        srcFileName: 'main.cpp',
        containerDir: '/app',
        compileCmd: {
            cmd: 'g++',
            args: ['main.cpp', '-o', 'a.out', '-std=c++17']
        },
        runCmd: {
            cmd: './a.out',
            args: []
        }
    }
};

function getLanguageConfig(language) {
    return languageConfig[language];
}

module.exports = { getLanguageConfig };
