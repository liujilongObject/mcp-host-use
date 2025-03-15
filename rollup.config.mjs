import { defineConfig } from 'rollup'
import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import json from '@rollup/plugin-json'

const extensions = ['.js', '.ts']

export default defineConfig([
  {
    input: 'src/main.ts',
    output: [
      // {
      //   file: 'dist/index.cjs',
      //   format: 'cjs',
      // },
      {
        file: 'dist/index.js',
        format: 'esm',
        exports: 'named',
      },
    ],
    plugins: [
      nodeResolve({ extensions }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
      }),
      json(),
      terser(),
    ],
  }
])
