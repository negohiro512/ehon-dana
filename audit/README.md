# 点検

毎週月曜の朝、GitHub Actions（.github/workflows/audit.yml）が tools/audit.mjs を回して、結果を latest.md・latest.json に書く。
書名が本とちがうISBN（データの取り違え）は ../cover_fix.json の bad に自動で足す。それ以外は Claude がルールを直す。
