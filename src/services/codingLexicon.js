/**
 * Technical Coding Lexicon & Acoustic Speech Normalizer
 * Maps speech-to-text misrecognitions directly to exact software engineering terminology in 0ms
 */

// Common phonetic speech recognition mishearings in tech interviews
const PHONETIC_CORRECTIONS = [
  // Front-End & JavaScript / TypeScript
  [/\b(?:deep\s*bow|deep\s*bounc\w*|d\s*bounc\w*|the\s*bounc\w*)\b/gi, 'debouncing'],
  [/\b(?:throat\s*link|throttel|throttol|throat\s*ling)\b/gi, 'throttling'],
  [/\b(?:brand\s*research|binary\s*sir|binary\s*searching)\b/gi, 'binary search'],
  [/\b(?:memo\s*ization|memorization|memo\s*ize)\b/gi, 'memoization'],
  [/\b(?:even\s*loop|event\s*look)\b/gi, 'event loop'],
  [/\b(?:note\s*js|no\s*js|not\s*js)\b/gi, 'Node.js'],
  [/\b(?:clothes\s*sure|close\s*your|close\s*sure)\b/gi, 'closure'],
  [/\b(?:hoist\s*thing|hoist\s*in)\b/gi, 'hoisting'],
  [/\b(?:curry\s*ing)\b/gi, 'currying'],
  [/\b(?:virtual\s*don|virtual\s*dom)\b/gi, 'Virtual DOM'],
  [/\b(?:re\s*duck\s*s|re\s*ducks|reducks)\b/gi, 'Redux'],
  [/\b(?:use\s*memo)\b/gi, 'useMemo'],
  [/\b(?:use\s*call\s*back)\b/gi, 'useCallback'],
  [/\b(?:use\s*effect)\b/gi, 'useEffect'],
  [/\b(?:use\s*state)\b/gi, 'useState'],
  [/\b(?:pro\s*miss|pro\s*misses)\b/gi, 'Promise'],
  [/\b(?:a\s*sync|a\s*sink)\b/gi, 'async'],
  [/\b(?:a\s*sync\s*await|a\s*sink\s*await)\b/gi, 'async/await'],
  [/\b(?:rest\s*full|rest\s*api)\b/gi, 'REST API'],
  [/\b(?:graph\s*q\s*l|graph\s*cool)\b/gi, 'GraphQL'],
  [/\b(?:web\s*pack)\b/gi, 'Webpack'],
  [/\b(?:web\s*socket|web\s*sockets)\b/gi, 'WebSocket'],
  [/\b(?:type\s*script)\b/gi, 'TypeScript'],

  // DSA & Algorithms
  [/\b(?:two\s*pointer|to\s*pointer|too\s*pointer)\b/gi, 'two pointers'],
  [/\b(?:sliding\s*windows?)\b/gi, 'sliding window'],
  [/\b(?:dynamic\s*programing|dp)\b/gi, 'dynamic programming'],
  [/\b(?:link\s*list|link\s*list\w*)\b/gi, 'linked list'],
  [/\b(?:hash\s*maps?|hash\s*tables?)\b/gi, 'hash map'],
  [/\b(?:breath\s*first\s*search|b\s*f\s*s)\b/gi, 'BFS (Breadth-First Search)'],
  [/\b(?:depth\s*first\s*search|d\s*f\s*s)\b/gi, 'DFS (Depth-First Search)'],
  [/\b(?:binary\s*trees?)\b/gi, 'binary tree'],
  [/\b(?:binary\s*search\s*trees?|b\s*s\s*t)\b/gi, 'Binary Search Tree (BST)'],
  [/\b(?:quick\s*short|quick\s*sort)\b/gi, 'quicksort'],
  [/\b(?:merge\s*short|merge\s*sort)\b/gi, 'merge sort'],
  [/\b(?:heap\s*short|heap\s*sort)\b/gi, 'heapsort'],
  [/\b(?:time\s*complex\w*)\b/gi, 'time complexity'],
  [/\b(?:space\s*complex\w*)\b/gi, 'space complexity'],
  [/\b(?:big\s*o\s*notation|big\s*oh)\b/gi, 'Big-O notation'],

  // OOP & Architecture
  [/\b(?:polly\s*morphism|poly\s*morphism)\b/gi, 'polymorphism'],
  [/\b(?:in\s*capsulation|en\s*capsulation)\b/gi, 'encapsulation'],
  [/\b(?:in\s*heritance)\b/gi, 'inheritance'],
  [/\b(?:ab\s*straction)\b/gi, 'abstraction'],
  [/\b(?:solid\s*princip\w*)\b/gi, 'SOLID principles'],
  [/\b(?:micro\s*services?)\b/gi, 'microservices'],
  [/\b(?:dead\s*locks?)\b/gi, 'deadlock'],
  [/\b(?:race\s*conditions?)\b/gi, 'race condition'],
  [/\b(?:load\s*balanc\w*)\b/gi, 'load balancer'],
  [/\b(?:rate\s*limit\w*)\b/gi, 'rate limiting'],
  [/\b(?:circuit\s*break\w*)\b/gi, 'circuit breaker'],
  [/\b(?:idempotenc\w*|idempotent)\b/gi, 'idempotency'],

  // Databases & Cloud / DevOps
  [/\b(?:cuba\s*net\w*|coober\s*net\w*|k\s*8\s*s)\b/gi, 'Kubernetes'],
  [/\b(?:dock\s*or|doc\s*er)\b/gi, 'Docker'],
  [/\b(?:seek\s*well|sequel)\b/gi, 'SQL'],
  [/\b(?:no\s*seek\s*well|no\s*sequel)\b/gi, 'NoSQL'],
  [/\b(?:post\s*gres|post\s*gre\s*s\s*q\s*l)\b/gi, 'PostgreSQL'],
  [/\b(?:mongo\s*d\s*b)\b/gi, 'MongoDB'],
  [/\b(?:red\s*diss|read\s*is)\b/gi, 'Redis'],
  [/\b(?:cough\s*ka)\b/gi, 'Kafka'],
  [/\b(?:rabbit\s*m\s*q)\b/gi, 'RabbitMQ'],
  [/\b(?:acid\s*propert\w*)\b/gi, 'ACID properties'],
  [/\b(?:cap\s*theorem|cup\s*theorem)\b/gi, 'CAP theorem'],
  [/\b(?:garbage\s*collect\w*)\b/gi, 'garbage collection'],
  [/\b(?:memory\s*leaks?)\b/gi, 'memory leak']
];

// Curated technical terms to boost in Deepgram Nova-3 keyterm parameter
const TECH_KEYTERMS = [
  'debouncing', 'throttling', 'binary search', 'algorithm', 'data structures',
  'time complexity', 'space complexity', 'Big O', 'recursion', 'dynamic programming',
  'two pointers', 'sliding window', 'linked list', 'hash map', 'binary tree', 'graph',
  'depth first search', 'breadth first search', 'microservices', 'database', 'SQL',
  'indexing', 'polymorphism', 'inheritance', 'encapsulation', 'abstraction', 'React',
  'Node.js', 'TypeScript', 'Python', 'REST API', 'GraphQL', 'Kubernetes', 'Docker',
  'Redis', 'Kafka', 'closure', 'event loop', 'asynchronous', 'promise', 'memory leak',
  'garbage collection', 'deadlock', 'race condition', 'SOLID principles', 'idempotency',
  'WebSocket', 'memoization', 'hoisting', 'currying', 'Virtual DOM', 'Redux'
];

/**
 * Normalizes speech-to-text transcript in 0ms using technical lexicon replacements
 */
function normalizeCodingSpeech(text) {
  if (!text || typeof text !== 'string') return text;
  let normalized = text;
  for (const [pattern, replacement] of PHONETIC_CORRECTIONS) {
    normalized = normalized.replace(pattern, replacement);
  }
  if (normalized.length > 0) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return normalized;
}

module.exports = {
  PHONETIC_CORRECTIONS,
  TECH_KEYTERMS,
  normalizeCodingSpeech
};
