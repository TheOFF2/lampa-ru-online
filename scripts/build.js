/* SPDX-License-Identifier: MIT */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const result = `/*! Lampa RU Online v${version} | MIT | https://github.com/TheOFF2/lampa-ru-online */\n` +
    ['core.js', 'plugin.js'].map(file => fs.readFileSync(path.join(root, 'src', file), 'utf8')).join('\n');
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'ru-online.js'), result);
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(root, 'public', 'LICENSE'));
console.log(`Built public/ru-online.js (${Buffer.byteLength(result)} bytes)`);
