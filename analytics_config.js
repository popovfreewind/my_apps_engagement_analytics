const ENGAGEMENT_SHEET = 'engagement_daily_db';
const ENGAGEMENT_SUBJECT_FILTERS = [
  'Engagement',
];

const ENGAGEMENT_DEDUP_KEY = 'row_key';

const ENGAGEMENT_HEADERS = [
  ENGAGEMENT_DEDUP_KEY,
  'date',
  'channel_name',
  'country_code',
  'viewers',
  'visitors',
  'average_minutes_per_viewer',
  'channel_installs',
  'channel_uninstalls',
  'net_installs',
  'cumulative_installs'
];

const ENGAGEMENT_CHANNEL_NAME_ALIASES = {
  'Never Have I Ever': [
    'Never Have I Ever - Sexy & Wild Game',
    'Never Have I Ever: The Ultimate Party Game - Starter, Adventures, Sexy & Vicious',
    'Never Have I Party - Sexy & Wild Game',
    'Never Have I Ever - Sexy & Wild',
    'Never have I ever'
  ],
  'Rolling Maze': [
    'Rolling Maze Game',
    'Rolling Maze: Spin Puzzle'
  ],
  'M3X screensaver': [
    'M3X Screensaver',
    'M3X Screensaver: Cyber Matrix',
    'M3X: Cyber Matrix Screensaver'
  ],
  'Never Have I Halloween': [
    'Never Have I Halloween',
    'Never Have I Ever: Halloween'
  ],
  'Draw and Learn': [
    'Draw and Learn - English for Kids',
    'My First English Coloring Book'
  ]
};

// Sheet layout constants
const HEADER_ROW = 1; // where headers live
const FIRST_DATA_ROW = HEADER_ROW + 1; // first row of actual data
