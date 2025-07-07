module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  extends: [
    'standard',
    'plugin:jest/recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    'no-console': 'warn',
    'max-len': [
      'error',
      {
        code: 100
      }
    ],
    camelcase: 'error',
    'no-unused-vars': 'error',
    'prefer-const': 'error',
    'no-var': 'error'
  }
}