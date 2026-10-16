/**
 * 共享类型定义 —— 被 Host、Client 与纯逻辑引擎共同引用。
 * 所有坐标/尺寸均使用「网格单元」而非像素，由布局引擎负责像素换算。
 */

/** 单个格子的几何信息（单位：网格单元） */
export interface GridRect {
  /** 列起点（0-based） */
  x: number
  /** 行起点（0-based） */
  y: number
  /** 占用的列数 */
  w: number
  /** 展开时占用的行数 */
  h: number
}

/** 格子承载的内容类型 */
export type BoxKind = 'shortcuts' | 'files' | 'note' | 'monitor'

/** 快捷入口项 */
export interface ShortcutItem {
  id: string
  label: string
  /** 目标：命令、URL 或文件路径 */
  target: string
  icon?: string
}

/** 文件夹投影配置 */
export interface FolderPortalProps {
  /** 被投影的目录绝对路径（Host 端解析） */
  directory: string
  /** 是否显示隐藏文件 */
  showHidden: boolean
  /** 单次最多加载的条目数（性能上限） */
  maxEntries: number
}

/** 文本便签内容 */
export interface NoteProps {
  text: string
  color?: string
}

/** 状态监控内容（预留：CPU/内存/任务数等，由后续 Provider 注入） */
export interface MonitorProps {
  metric: string
  refreshMs: number
}

/** 按类型区分的格子属性 */
export type BoxProps =
  | { kind: 'shortcuts'; items: ShortcutItem[] }
  | { kind: 'files'; portal: FolderPortalProps }
  | { kind: 'note'; note: NoteProps }
  | { kind: 'monitor'; monitor: MonitorProps }

/** 外观配置 */
export interface BoxStyle {
  /** 0~1 半透明程度 */
  opacity: number
  /** 是否启用毛玻璃（backdrop-filter） */
  glass: boolean
  /** 自定义强调色（覆盖主题色） */
  accent?: string
}

/** 一个完整的格子定义 */
export interface GridBox extends GridRect {
  id: string
  title: string
  kind: BoxKind
  props: BoxProps
  style: BoxStyle
  /** 分组 id，用于「分组管理」 */
  group: string
  /** 是否折叠（卷起）—— 只保留标题栏 */
  collapsed: boolean
  minW?: number
  minH?: number
}

/** 整个画布的布局状态 */
export interface LayoutState {
  /** 网格列数 */
  cols: number
  /** 单行高度（像素） */
  rowHeight: number
  /** 格子间距（像素） */
  gap: number
  /** 所有格子 */
  boxes: GridBox[]
  /** 分组顺序（可选，用于分组折叠/排序） */
  groups: string[]
}

/** 布局引擎可被持久化的最小快照（几何 + 折叠，不含内容） */
export type LayoutSnapshot = Pick<LayoutState, 'cols' | 'rowHeight' | 'gap'> & {
  boxes: Array<Pick<GridBox, 'id' | 'x' | 'y' | 'w' | 'h' | 'collapsed' | 'group'>>
}

/** 文件系统条目（Host 端 listDir 返回的归一化结构） */
export interface FileEntry {
  name: string
  path: string
  kind: 'file' | 'dir'
  ext: string
  size: number
  mtime: number
}

/** 目录列表结果（含分页截断信息） */
export interface DirectoryListing {
  path: string
  entries: FileEntry[]
  total: number
  truncated: boolean
}

/** 自动归类：匹配条件 */
export type RuleMatch =
  | { kind: 'ext'; values: string[] }        // 按扩展名（如 ['.png', '.jpg']）
  | { kind: 'name'; pattern: string }         // 按文件名正则/glob
  | { kind: 'tag'; values: string[] }         // 按标签（与外部标签系统联动）
  | { kind: 'size'; gt?: number; lt?: number } // 按大小（字节）

/** 自动归类规则 */
export interface AutoSortRule {
  id: string
  name: string
  match: RuleMatch
  /** 命中的文件吸附到哪个格子 */
  targetBoxId: string
  enabled: boolean
}

/** 目录变更事件（watch 推送，供 Client 增量刷新） */
export type DirectoryChange =
  | { type: 'add'; entry: FileEntry }
  | { type: 'remove'; path: string }
  | { type: 'change'; entry: FileEntry }
