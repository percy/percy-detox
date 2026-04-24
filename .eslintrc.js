module.exports = {
  root: true,
  extends: ['standard'],
  env: {
    node: true,
    jasmine: true
  },
  parserOptions: {
    ecmaVersion: 2022
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'space-before-function-paren': 'off',
    semi: ['error', 'always']
  }
};
