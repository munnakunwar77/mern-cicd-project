module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'reports', outputName: 'junit.xml' }]
  ],
  coverageThreshold: {
    global: { branches: 60, functions: 80, lines: 80, statements: 80 }
  },
  testTimeout: 60000
};
