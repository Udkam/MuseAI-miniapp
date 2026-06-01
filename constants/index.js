// RAG pipeline step display config (ported from useChat.js)
const RAG_STEP_CONFIG = {
  rewrite:  { label: '查询分析', icon: '🔍' },
  retrieve: { label: '文档检索', icon: '📚' },
  rerank:   { label: '结果排序', icon: '📊' },
  evaluate: { label: '质量评估', icon: '✓' },
  transform:{ label: '查询优化', icon: '🔄' },
  generate: { label: '生成回答', icon: '✨' },
}

// Tour persona definitions
const PERSONA = {
  A: { key: 'archaeology',     label: '考古研究员', reportTitle: '半坡考古研究报告' },
  B: { key: 'field_study',     label: '研学记录员', reportTitle: '半坡研学记录报告' },
  C: { key: 'history_inquiry', label: '历史追问者', reportTitle: '半坡历史追问报告' },
  D: { key: 'artifact_study',  label: '器物研究员', reportTitle: '半坡器物观察报告' },
}

// Tour lifecycle status values (match backend)
const TOUR_STATUS = {
  ONBOARDING: 'onboarding',
  OPENING:    'opening',
  TOURING:    'touring',
  COMPLETED:  'completed',
}

// Storage key names — single source of truth (mirrors utils/storage.js KEYS)
const STORAGE_KEYS = {
  AUTH_TOKEN:            'auth_token',
  USER:                  'user',
  USER_ROLE:             'user_role',
  TOUR_SESSION_ID:       'tour_session_id',
  TOUR_SESSION_TOKEN:    'tour_session_token',
  TOUR_SESSION_CREATED_AT: 'tour_session_created_at',
  TOUR_SESSION_SCHEMA_VERSION: 'tour_session_schema_version',
  TOUR_AI_CONVERSATION_COUNT: 'tour_ai_conversation_count',
  TOUR_CACHE_SCHEMA_VERSION: 'tour_cache_schema_version',
  TOUR_PENDING_EVENTS:   'tour_pending_events',
  TOUR_CURRENT_HALL:     'tour_current_hall',
  TOUR_UI_PREFS:         'tour_workbench_ui_prefs',
  TOUR_STYLE_PREFS:      'tour_workbench_style_prefs',
  TOUR_TTS_PREFS:        'tour_workbench_tts_prefs',
}

// Tour report radar chart dimension keys
const REPORT_RADAR_KEYS = [
  'cultural_interest',    // 文化兴趣
  'exploration_depth',    // 探索深度
  'time_engagement',      // 时间投入
  'interaction_count',    // 互动次数
  'exhibit_coverage',     // 展品覆盖
]

// Exhibit categories (ported from src/constants/categories.js)
const EXHIBIT_CATEGORIES = [
  { value: 'bronze',      label: '青铜器' },
  { value: 'ceramic',     label: '陶瓷' },
  { value: 'painting',    label: '书画' },
  { value: 'jade',        label: '玉器' },
  { value: 'gold_silver', label: '金银器' },
  { value: 'sculpture',   label: '雕塑' },
]

// Answer style maps (used by buildStyledPrompt in store/tour.js)
const ANSWER_LENGTH_MAP = {
  brief:    '简短',
  balanced: '适中',
  detailed: '详细',
}
const DEPTH_MAP = {
  introductory: '入门',
  standard:     '标准',
  deep:         '深入',
}
const TERMINOLOGY_MAP = {
  plain:        '通俗',
  professional: '专业',
  academic:     '学术',
}

module.exports = {
  RAG_STEP_CONFIG,
  PERSONA,
  TOUR_STATUS,
  STORAGE_KEYS,
  REPORT_RADAR_KEYS,
  EXHIBIT_CATEGORIES,
  ANSWER_LENGTH_MAP,
  DEPTH_MAP,
  TERMINOLOGY_MAP,
}
