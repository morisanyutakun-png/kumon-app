/* 進度エンジンの単体テスト。実行: npx tsx scripts/progress-test.ts */
import {
  advanceOnPass,
  currentRangeLabel,
  currentReviewLabel,
  isInTotalReview,
  nextRangeLabel,
  progressLabel,
  sessionPlan,
  type AssignmentProgress,
  type MaterialInfo,
  type UnitInfo,
} from "@/lib/progress";

let pass = 0,
  fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else {
    fail++;
    console.log(`FAIL: ${name}\n   got=${JSON.stringify(got)}\n  want=${JSON.stringify(want)}`);
  }
}

const A = (p: Partial<AssignmentProgress>): AssignmentProgress => ({
  progressIndex: 0,
  unitsPerSession: 1,
  unitsPerSessionPending: null,
  pointer: 1,
  reviewEnabled: true,
  ...p,
});

// ---- chapter (units) per=1, delete ----
const chap: MaterialInfo = {
  progressType: "chapter",
  numberStart: null,
  numberEnd: null,
  completionAction: "delete",
};
const units3: UnitInfo[] = [
  { title: "A-1", rangeText: "1〜10" },
  { title: "A-2", rangeText: "11〜20" },
  { title: "A-3", rangeText: "21〜30" },
];

eq("chap current@0", currentRangeLabel(A({}), chap, units3), "A-1");
eq("chap review@0 null", currentReviewLabel(A({}), chap, units3), null);
eq("chap next@0", nextRangeLabel(A({}), chap, units3), "A-2");
eq("chap progressLabel@0", progressLabel(A({}), chap, units3), "1/3 回目");

let r = advanceOnPass(A({}), chap, units3);
eq("chap advance@0 progress", r.progressIndex, 1);
eq("chap advance@0 pointer", r.pointer, 2);
eq("chap advance@0 status", r.status, "active");

eq("chap current@1", currentRangeLabel(A({ progressIndex: 1, pointer: 2 }), chap, units3), "A-2");
eq("chap review@1", currentReviewLabel(A({ progressIndex: 1, pointer: 2 }), chap, units3), "A-1");
eq("chap next@1", nextRangeLabel(A({ progressIndex: 1, pointer: 2 }), chap, units3), "A-3");

eq("chap next@2 完了", nextRangeLabel(A({ progressIndex: 2, pointer: 3 }), chap, units3), "完了");
eq("chap review@2", currentReviewLabel(A({ progressIndex: 2, pointer: 3 }), chap, units3), "A-1~A-2");

r = advanceOnPass(A({ progressIndex: 2, pointer: 3 }), chap, units3);
eq("chap advance@2 finished", r.finished, true);
eq("chap advance@2 completed", r.status, "completed");
eq("chap advance@2 progress", r.progressIndex, 3);

// ---- number per=2, delete ----
const num: MaterialInfo = {
  progressType: "number",
  numberStart: 1,
  numberEnd: 5,
  completionAction: "delete",
};
const noUnits: UnitInfo[] = [];
eq("num current@0", currentRangeLabel(A({ unitsPerSession: 2 }), num, noUnits), "1-2");
eq("num next@0", nextRangeLabel(A({ unitsPerSession: 2 }), num, noUnits), "3-4");
r = advanceOnPass(A({ unitsPerSession: 2 }), num, noUnits);
eq("num advance@0 progress", r.progressIndex, 2);
eq("num current@2", currentRangeLabel(A({ progressIndex: 2, unitsPerSession: 2 }), num, noUnits), "3-4");
eq("num review@2", currentReviewLabel(A({ progressIndex: 2, unitsPerSession: 2 }), num, noUnits), "1-2");
eq("num current@4 (last single)", currentRangeLabel(A({ progressIndex: 4, unitsPerSession: 2 }), num, noUnits), "5");
eq("num next@4 完了", nextRangeLabel(A({ progressIndex: 4, unitsPerSession: 2 }), num, noUnits), "完了");
r = advanceOnPass(A({ progressIndex: 4, unitsPerSession: 2 }), num, noUnits);
eq("num advance@4 completed", r.status, "completed");
eq("num advance@4 progress=total", r.progressIndex, 5);

// ---- review_loop (chapter, 2 units) ----
const loop: MaterialInfo = {
  progressType: "chapter",
  numberStart: null,
  numberEnd: null,
  completionAction: "review_loop",
};
const units2: UnitInfo[] = [
  { title: "U1", rangeText: "" },
  { title: "U2", rangeText: "" },
];
eq("loop next@1 総復習", nextRangeLabel(A({ progressIndex: 1, pointer: 2 }), loop, units2), "総復習");
r = advanceOnPass(A({ progressIndex: 1, pointer: 2 }), loop, units2);
eq("loop advance@1 inTotalReview", r.inTotalReview, true);
eq("loop advance@1 finished", r.finished, true);
eq("loop advance@1 status active", r.status, "active");
eq("loop advance@1 progress=total", r.progressIndex, 2);

const inLoop = A({ progressIndex: 2, pointer: 3 });
eq("loop isInTotalReview", isInTotalReview(inLoop, loop, units2), true);
eq("loop plan current", sessionPlan(inLoop, loop, units2).current, "総復習");
eq("loop plan next", sessionPlan(inLoop, loop, units2).next, "総復習");
eq("loop plan progressLabel", sessionPlan(inLoop, loop, units2).progressLabel, "総復習中");
r = advanceOnPass(inLoop, loop, units2);
eq("loop advance-in-loop progress stays", r.progressIndex, 2);
eq("loop advance-in-loop pointer++", r.pointer, 4);
eq("loop advance-in-loop still loop", r.inTotalReview, true);

// ---- manual ----
const man: MaterialInfo = {
  progressType: "manual",
  numberStart: null,
  numberEnd: null,
  completionAction: "delete",
};
eq("manual current null", currentRangeLabel(A({}), man, noUnits), null);
r = advanceOnPass(A({ pointer: 5 }), man, noUnits);
eq("manual advance pointer++", r.pointer, 6);
eq("manual advance progress stays", r.progressIndex, 0);
eq("manual advance not finished", r.finished, false);

// ---- pending per-session change ----
eq(
  "pending per applies to next label",
  nextRangeLabel(A({ progressIndex: 0, unitsPerSession: 1, unitsPerSessionPending: 2 }), num, noUnits),
  // newProgress=0+1=1, newPer=2 → current@1 with per2 = 2-3
  "2-3",
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
