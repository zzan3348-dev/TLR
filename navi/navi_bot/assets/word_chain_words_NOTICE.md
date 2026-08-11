# Word Chain Dictionary Notice

`word_chain_words.sqlite3` includes Korean noun entries extracted, filtered, and
transformed from the `kkutu_ko` table in `db.sql` from JJoriping/KKuTu.

- Source project: https://github.com/JJoriping/KKuTu
- Source file: https://github.com/JJoriping/KKuTu/blob/master/db.sql
- Source commit checked: `a2c240bc31fe2dea31d26fb1cf7625b4645556a6`
- Upstream copyright notice: Copyright (C) 2017 JJoriping(op@jjo.kr)
- Upstream license: GNU General Public License v3.0 or later

This repository stores the extracted dictionary as a compact SQLite seed database
used by NAVI's word-chain game. Import filtering keeps Hangul words with length
2 or more, KKuTu type code `1`, and flag `0`, then excludes common inflected
suffixes such as `하다` and `되다`. The full GPL v3 license text is included in
`word_chain_words_GPL-3.0.txt`.
