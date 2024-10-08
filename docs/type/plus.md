---
outline: deep
---

# 排行榜类型：Plus

定制能力强化的排行榜。从 `v0.0.11` 版本开始为默认排行榜。需要 AOI Server v1.1.7 及以上版本。

## 配置

```ini
type=plus
# Topstar数，设置为0则不显示
topstars=10
# 筛选包含特定Tag的参赛者。以逗号分隔。
participantTagWhitelist=A,B
# 筛选不包含特定Tag的参赛者。以逗号分隔。
participantTagBlacklist=A,B
# 筛选包含特定Tag的题目。以逗号分隔。
problemTagWhitelist=A,B
# 筛选不包含特定Tag的题目。以逗号分隔。
problemTagBlacklist=A,B
# 筛选特定Slug的题目。将解析为RegExp
problemSlugFilter=A|B
# 筛选特定Title的题目。将解析为RegExp
problemTitleFilter=A|B
# 单题分数计算方式。支持：
# override: 以最后一次提交的分数为准
# max: 以最高分为准
# min: 以最低分为准
scoreReduceMethod=override
# 总分计算方式。支持：
# sum: 简单求和
# max: 取最高分
# min: 取最低分
totalReduceMethod=sum
# 是否显示原始分数(百分制)。若为0则显示按照比赛设定的分数比例换算后的分数
showOriginalScore=0
# 是否在选手得分中显示题目分数
showProblemScore=0
# 是否显示选手最后提交的时间戳
showLastSubmission=0
# 对于同分选手，令其排名也相同
sameRankForSameScore=0
# 只统计在该时间前提交的解答
submittedBefore=08/17/1926, 8:00:00 PM
# 只统计在该时间及其之后提交的解答
submittedAfter=08/17/1926, 8:00:00 AM

# v0.0.13新增
# 阶段配置。若设置，将覆盖比赛阶段的配置
# 阶段白名单。以逗号分隔
stageWhitelist=running
# 阶段黑名单。以逗号分隔
stageBlacklist=end

# v0.0.14新增
# 在通过某题后，忽略后续提交
skipAfterAccepted=0

# v0.0.15新增
# 是否包含被Ban的选手
includeBannded=0
```
