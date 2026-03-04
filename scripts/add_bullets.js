const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "lib", "recapContent.ts");
let content = fs.readFileSync(filePath, "utf8");

let count = 0;

// Handle double-quoted explanation values
content = content.replace(
    /(explanation\s*:\s*\n?\s*)"((?:[^"\\]|\\.)*)"/g,
    (match, prefix, inner) => {
        // Skip if already has bullet points
        if (inner.startsWith("• ")) return match;

        count++;
        let modified = "• " + inner;
        // Add bullet after every \n
        modified = modified.replace(/\\n/g, "\\n• ");
        // Fix double newlines: \n• \n•  should be \n\n• 
        modified = modified.replace(/\\n• \\n• /g, "\\n\\n• ");
        return prefix + '"' + modified + '"';
    }
);

// Handle single-quoted explanation values
content = content.replace(
    /(explanation\s*:\s*\n?\s*)'((?:[^'\\]|\\.)*)'/g,
    (match, prefix, inner) => {
        if (inner.startsWith("• ")) return match;

        count++;
        let modified = "• " + inner;
        modified = modified.replace(/\\n/g, "\\n• ");
        modified = modified.replace(/\\n• \\n• /g, "\\n\\n• ");
        return prefix + "'" + modified + "'";
    }
);

fs.writeFileSync(filePath, content, "utf8");
console.log(`Done! Added bullet points to ${count} explanation fields.`);
