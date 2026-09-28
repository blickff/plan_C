/* The habit library people pick from.

   Every habit is a number with a goal — a tick box is just goal: 1. One
   mechanic covers "did I work out" and "how many glasses of water", which
   keeps the tile, the streak maths and the grid free of branching.

   step is how much one click adds. Without it a habit measured in steps
   would need sixteen thousand clicks.

   Learning is deliberately the longest category: it is where the interest
   sits. */

var PRESETS = [
  {
    category: 'Learning and growth',
    items: [
      { id: 'language', name: 'Language practice', goal: 20, unit: 'min', step: 5 },
      { id: 'vocabulary', name: 'New words', goal: 15, unit: 'words', step: 5 },
      { id: 'listening', name: 'Listening practice', goal: 15, unit: 'min', step: 5 },
      { id: 'reading', name: 'Reading', goal: 20, unit: 'pages', step: 5 },
      { id: 'course', name: 'Online course', goal: 1, unit: 'lesson', step: 1 },
      { id: 'coding', name: 'Coding practice', goal: 30, unit: 'min', step: 10 }
    ]
  },
  {
    category: 'Sport and body',
    items: [
      { id: 'workout', name: 'Workout', goal: 1, unit: 'session', step: 1 },
      { id: 'run', name: 'Run', goal: 1, unit: 'run', step: 1 },
      { id: 'steps', name: 'Steps', goal: 8000, unit: 'steps', step: 500 },
      { id: 'stretching', name: 'Stretching', goal: 10, unit: 'min', step: 5 }
    ]
  },
  {
    category: 'Health and routine',
    items: [
      { id: 'water', name: 'Water', goal: 8, unit: 'glasses', step: 1 },
      { id: 'earlynight', name: 'Sleep before midnight', goal: 1, unit: 'day', step: 1 },
      { id: 'nosmoking', name: 'No smoking', goal: 1, unit: 'day', step: 1 },
      { id: 'noalcohol', name: 'No alcohol', goal: 1, unit: 'day', step: 1 }
    ]
  },
  {
    category: 'Work and focus',
    items: [
      { id: 'deepwork', name: 'Deep work', goal: 2, unit: 'hours', step: 1 },
      { id: 'tasksdone', name: 'Tasks finished', goal: 3, unit: 'tasks', step: 1 },
      { id: 'nosocial', name: 'No social media', goal: 1, unit: 'day', step: 1 },
      { id: 'inboxzero', name: 'Inbox at zero', goal: 1, unit: 'day', step: 1 }
    ]
  }
];
