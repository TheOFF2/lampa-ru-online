'use strict';
const fs = require('node:fs');
const acorn = require('acorn');
const C = require('../src/core');
const source = fs.readFileSync('public/ru-online.js', 'utf8');
acorn.parse(source, { ecmaVersion: 5 });
C.catalog(JSON.parse(fs.readFileSync('public/catalog.json')), 'https://theoff2.github.io/lampa-ru-online/catalog.json');
if (source.includes('eval(') || source.includes('new Function(')) throw Error('Dynamic execution forbidden');
console.log('ES5 bundle and shipped catalog validated');
