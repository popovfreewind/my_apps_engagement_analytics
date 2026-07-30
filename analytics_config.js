const ENGAGEMENT_SUBJECT_FILTERS = [
  'Engagement',
];

// BigQuery destination for engagement data
const BIGQUERY_CONFIG = {
  PROJECT_ID: 'freewind-software',
  DATASET_ID: 'roku_analytics',
  TABLE_ENGAGEMENT: 'engagement_daily',
  // Location of the roku_analytics dataset; must match its actual location or
  // BigQuery.Jobs.query will fail to find the job/dataset.
  LOCATION: 'US'
};

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
