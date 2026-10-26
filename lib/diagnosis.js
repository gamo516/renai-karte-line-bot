// 診断の判定。いちばん多いタイプが結果。
// 同点なら、後の設問ほど本音に近いとみなして、同点のタイプのうち最後に選んだものを優先する
function resolveTag(tagCounts, answers) {
  const max = Math.max(...Object.values(tagCounts));
  const tied = Object.keys(tagCounts).filter((t) => tagCounts[t] === max);
  if (tied.length === 1) return tied[0];
  for (let i = answers.length - 1; i >= 0; i--) {
    if (tied.includes(answers[i])) return answers[i];
  }
  return tied[0];
}

module.exports = { resolveTag };
