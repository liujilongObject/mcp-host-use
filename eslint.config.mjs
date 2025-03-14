import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'
import tsEslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tsEslint.config(
  // 启用类型检查的规则
  ...tsEslint.configs.strictTypeChecked,
  ...tsEslint.configs.stylisticTypeChecked,

  // 代码风格规则
  stylistic.configs['recommended-flat'],
  {
    files: ['src/**/*.ts', 'src/**/*.mjs', 'src/**/*.js'],
    languageOptions: {
      parser: tsEslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: '.',
      },
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      // TypeScript 规则
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-deprecated': 'off', // window.external is deprecated
      '@typescript-eslint/no-empty-function': 'off', // 允许空函数: window.external.AppCmd 回调函数可能为空
    },
  },
  {
    // 全局变量配置
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    // 忽略文件配置
    ignores: [
      'dist/**',
      'node_modules/**',
      'eslint.config.mjs',
      'commitlint.config.mjs',
      'rollup.config.mjs',
      'scripts/**',
      'examples/**',
      'docs/**',
    ],
  },
  // 禁用所有与 Prettier 冲突的规则
  eslintConfigPrettier,
)
