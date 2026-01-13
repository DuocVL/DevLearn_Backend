const languageConfig = {
  python: {
    image: 'python:3.9-slim',
    srcFileName: 'main.py',
    containerDir: '/usr/src/app', // Added
    runCmd: { cmd: 'python3', args: ['main.py'] },
  },
  javascript: {
    image: 'node:18-slim',
    srcFileName: 'main.js',
    containerDir: '/usr/src/app', // Added
    runCmd: { cmd: 'node', args: ['main.js'] },
  },
  cpp: {
    image: 'gcc:11',
    srcFileName: 'main.cpp',
    containerDir: '/usr/src/app', // Added
    compileCmd: { cmd: 'g++', args: ['-O2', '-std=c++17', 'main.cpp', '-o', 'a.out'] },
    runCmd: { cmd: './a.out', args: [] },
  },
  // Thêm các ngôn ngữ khác ở đây
  // java: {
  //   image: 'openjdk:11-jre-slim',
  //   srcFileName: 'Main.java',
  //   containerDir: '/usr/src/app',
  //   compileCmd: { cmd: 'javac', args: ['Main.java'] },
  //   runCmd: { cmd: 'java', args: ['Main'] },
  // }
};

const getLanguageConfig = (language) => {
    return languageConfig[language];
}

module.exports = { getLanguageConfig };
