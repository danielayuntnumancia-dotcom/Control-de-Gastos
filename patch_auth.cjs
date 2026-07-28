const fs = require('fs');
let code = fs.readFileSync('src/context/AuthContext.tsx', 'utf-8');
code = code.replace(
  "email: currentUser.email,",
  "email: currentUser.email || '',"
);
fs.writeFileSync('src/context/AuthContext.tsx', code);
