const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'lib', 'recapContent.ts');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

let currentDay = null;
let topicCount = 0;
const issues = [];

for (let i = 0; i < lines.length; i++) {
    const dayMatch = lines[i].match(/id:\s*"sc_day_(\d+)"/);
    if (dayMatch) {
        const dayNum = parseInt(dayMatch[1]);
        if (dayNum >= 60 && dayNum <= 85) {
            currentDay = dayNum;
            topicCount = 0;
        } else {
            currentDay = null;
        }
        continue;
    }

    if (currentDay !== null) {
        const topicMatch = lines[i].match(/id:\s*"([^"]+)"/);
        if (topicMatch) {
            topicCount++;
            const actualId = topicMatch[1];
            const expectedId = `sc_day_${currentDay}_t${topicCount}`;
            if (actualId !== expectedId) {
                issues.push({
                    line: i + 1,
                    day: currentDay,
                    topicNum: topicCount,
                    actual: actualId,
                    expected: expectedId
                });
            }
        }
        // Reset when we see the closing of a day section
        if (lines[i].trim() === '},') {
            // check if next non-empty line starts a new day key
        }
    }
}

console.log(`Found ${issues.length} incorrect topic IDs:\n`);
issues.forEach(issue => {
    console.log(`Line ${issue.line}: Day ${issue.day}, Topic ${issue.topicNum}`);
    console.log(`  Actual:   "${issue.actual}"`);
    console.log(`  Expected: "${issue.expected}"`);
    console.log();
});
