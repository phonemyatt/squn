# Changelog


## v0.2.4

[compare changes](https://github.com/phonemyatt/squn/compare/v0.2.3...v0.2.4)

### 🚀 Enhancements

- **sql:** Auto-append trailing semicolon at execution boundaries ([#10](https://github.com/phonemyatt/squn/pull/10))
- **api:** Add deleteRow() and upsert() typed mutation methods ([#12](https://github.com/phonemyatt/squn/pull/12))
- **migrations:** Add runMigrations() and rollbackMigration() runner ([#13](https://github.com/phonemyatt/squn/pull/13))
- **cache:** Add createCachedDb() result-row cache wrapper ([#14](https://github.com/phonemyatt/squn/pull/14))
- **pagination:** Add offsetPage() and cursorPage() helpers ([#15](https://github.com/phonemyatt/squn/pull/15))

### 🩹 Fixes

- **ci:** Switch MySQL to native password auth for Bun compatibility ([3159392](https://github.com/phonemyatt/squn/commit/3159392))
- **ci:** Resolve MSSQL install and MySQL auth for showcase ([956b65a](https://github.com/phonemyatt/squn/commit/956b65a))
- Restore @types/mssql alongside runtime mssql dep ([62c9695](https://github.com/phonemyatt/squn/commit/62c9695))
- **ci:** Resolve MySQL auth and MSSQL placeholder translation ([#16](https://github.com/phonemyatt/squn/pull/16))
- **mysql:** Replace Bun.SQL with mysql2 to fix CI connection failures ([#17](https://github.com/phonemyatt/squn/pull/17))
- **mysql:** Unref pool connections to prevent showcase hang ([#18](https://github.com/phonemyatt/squn/pull/18))

### 🤖 CI

- Add multi-adapter showcase job with service containers ([872f20d](https://github.com/phonemyatt/squn/commit/872f20d))
- Add publish.yml — npm release workflow triggered by version tags ([1ae9f4c](https://github.com/phonemyatt/squn/commit/1ae9f4c))
- Add workflow_dispatch and master branch trigger ([2f9e44c](https://github.com/phonemyatt/squn/commit/2f9e44c))
- Remove showcase from publish workflow — CI handles it ([461e927](https://github.com/phonemyatt/squn/commit/461e927))

### ❤️ Contributors

- Robbin Chen ([@phonemyatt](https://github.com/phonemyatt))
- Phone Myat Thu <phonemyatthu@navig8group.com>

