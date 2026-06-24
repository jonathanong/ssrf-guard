const fs = require('fs');
let code = fs.readFileSync('src/core/url-safety.mts', 'utf8');
code = code.replace(
  'return (\n    policy.exact.some((exact) => exact.toLowerCase() === hostname) || policy.suffixes.some((suffix) => hostname.endsWith(suffix.toLowerCase()))\n  );',
  'return (\n    policy.exact.some((exact) => exact.toLowerCase() === hostname) ||\n    policy.suffixes.some((suffix) => hostname.endsWith(suffix.toLowerCase()))\n  );'
);
fs.writeFileSync('src/core/url-safety.mts', code);
