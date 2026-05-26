#!/usr/bin/env bash
# 固定第三方 judge harness（RUN → DUMP → READ 的 RUN+DUMP 两段）。
#   RUN  : 只跑固定工具（tsc 类型检查 + bun test 键位 probe）
#   DUMP : 把 exit code / 原始 stdout+stderr / keymap.json 落到 .judge/<run>/
# 结论（READ 段）由读 judge.json 的 LLM 下，不在这里写措辞。
set -u
cd "$(dirname "$0")/.."

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
export JUDGE_RUN_ID="$RUN_ID"
DIR=".judge/$RUN_ID"
mkdir -p "$DIR"

# ── 工具 1：类型检查 ─────────────────────────────────────────────────────────
bunx tsc --noEmit >"$DIR/tsc.stdout.txt" 2>"$DIR/tsc.stderr.txt"
TSC_EXIT=$?

# ── 工具 2：键位 probe（写 keymap.json 由测试 afterAll 完成）────────────────
bun test tests/tui-keymap.test.ts >"$DIR/buntest.stdout.txt" 2>"$DIR/buntest.stderr.txt"
TEST_EXIT=$?

KM="$DIR/keymap.json"
field() { # $1 = summary key; plain stdout, no ANSI, -1 on any failure
  NO_COLOR=1 bun -e "try{const s=JSON.parse(await Bun.file('$KM').text()).summary;process.stdout.write(String(s['$1']))}catch(e){process.stdout.write('-1')}" 2>/dev/null
}
TOTAL=$(field total_assertions)
PASSED=$(field passed)
FAILED=$(field failed)

VERDICT="FAIL"
if [ "$TSC_EXIT" -eq 0 ] && [ "$TEST_EXIT" -eq 0 ] && [ "$FAILED" = "0" ] && [ "$TOTAL" -gt 0 ]; then
  VERDICT="PASS"
fi

cat >"$DIR/judge.json" <<JSON
{
  "harness": "tui-howto-guide-judge",
  "run_id": "$RUN_ID",
  "verdict": "$VERDICT",
  "tools": {
    "typecheck": { "cmd": "bunx tsc --noEmit", "exit_code": $TSC_EXIT, "stdout_path": "$DIR/tsc.stdout.txt", "stderr_path": "$DIR/tsc.stderr.txt" },
    "keymap_probe": { "cmd": "bun test tests/tui-keymap.test.ts", "exit_code": $TEST_EXIT, "stdout_path": "$DIR/buntest.stdout.txt", "evidence_json": "$KM" }
  },
  "metrics": { "total_assertions": $TOTAL, "passed": $PASSED, "failed": $FAILED },
  "evidence_dir": "$DIR"
}
JSON

echo "VERDICT=$VERDICT  total=$TOTAL passed=$PASSED failed=$FAILED  tsc=$TSC_EXIT test=$TEST_EXIT"
echo "judge.json -> $DIR/judge.json"
[ "$VERDICT" = "PASS" ] && exit 0 || exit 1
