#!/usr/bin/env sh
# 发布到 GitHub Pages：把 main 分支里的 app/ 目录推送到 gh-pages 分支。
# 用法（在项目文件夹里，先提交好改动）：sh deploy.sh
# 网址：https://heawin-prt.github.io/sourcing-records/
set -e
cd "$(dirname "$0")"
if [ -n "$(git status --porcelain)" ]; then
  echo "有未提交的改动，请先提交再发布。"; exit 1
fi
git push origin main
SHA=$(git subtree split --prefix app main)
git push origin "$SHA:refs/heads/gh-pages"
echo "已发布 $(grep -o "'[0-9.]*'" app/js/version.js)，1–2 分钟后生效。"
