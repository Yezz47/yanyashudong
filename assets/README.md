# 小树洞角色资源映射

原始角色设定图保存在 `treehole-character-sheet.png`，仅作为设计依据。页面实际使用五张完整、独立的透明角色抠图，不再从整张设定稿或精灵图中裁切。

| 状态 | 独立透明素材 | 页面动效 |
| --- | --- | --- |
| 待机 | `treehole-idle-v3.png` | 微呼吸、轻微上浮 |
| 倾听 | `treehole-listening-v3.png` | 轻微点头 |
| 思考 | `treehole-thinking-v3.png` | 低头思考 |
| 陪伴 | `treehole-companion-v3.png` | 抱心轻呼吸 |
| 给建议 | `treehole-suggestion-v3.png` | 托起嫩芽、轻微递出 |

## 后续替换建议

- 如果之后有独立透明 PNG，可分别导出为 4:5、1200 × 1500 px。
- 五张图保持同一视角、比例和核心造型，只改变姿态与小道具。
- 五张图四周均保留透明安全距离，页面使用 `object-fit: contain` 完整展示，不允许截断头顶嫩芽、侧枝叶或脚部。

缺少图片时，页面仍会显示温和的回退状态，不影响对话使用。
