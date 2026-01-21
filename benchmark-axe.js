'use strict';

const fs = require('fs');
const puppeteer = require('puppeteer');

// Load mappings and test cases
const axeMapping = JSON.parse(fs.readFileSync('axe-to-act-mapping.json', 'utf8'));
const actData = JSON.parse(fs.readFileSync('act-testcases.json', 'utf8'));

// Filter test cases that have a mapping in axe-core
const testcases = actData.testcases.filter(tc => axeMapping[tc.ruleId]);

const LIMIT = null; // Set to null for all test cases
const activeTestCases = LIMIT ? testcases.slice(0, LIMIT) : testcases;
const CONCURRENCY = 10;

console.log(`Found ${activeTestCases.length} test cases for axe-core mapped rules.`);

async function runBenchmark() {
    const browser = await puppeteer.launch({ headless: true });
    const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

    const results = {
        tp: 0, fp: 0, fn: 0, tn: 0,
        totalTime: 0,
        count: 0
    };

    const startTime = Date.now();

    async function processTestCase(tc) {
        const page = await browser.newPage();
        try {
            const urlStartTime = Date.now();
            await page.goto(tc.url, { waitUntil: 'load', timeout: 10000 });

            await page.evaluate(axeSource);
            const axeRuleIds = axeMapping[tc.ruleId];

            const axeResults = await page.evaluate(async (rules) => {
                return await axe.run({ runOnly: rules });
            }, axeRuleIds);

            const urlEndTime = Date.now();

            const isViolation = axeResults.violations.length > 0;
            const isPass = axeResults.passes.length > 0;

            let outcome = 'inapplicable';
            if (isViolation) {
                outcome = 'failed';
            } else if (isPass) {
                outcome = 'passed';
            }

            const expected = tc.expected; // 'passed', 'failed', 'inapplicable'

            if (expected === 'failed') {
                if (outcome === 'failed') results.tp++;
                else results.fn++;
            } else if (expected === 'passed') {
                if (outcome === 'failed') results.fp++;
                else results.tn++;
            }

            results.totalTime += (urlEndTime - urlStartTime);
            results.count++;

            if (results.count % 50 === 0) {
                console.log(`Processed ${results.count}/${activeTestCases.length}...`);
            }
        } catch (err) {
            // console.error(`Error processing ${tc.url}: ${err.message}`);
        } finally {
            await page.close();
        }
    }

    // Process in batches
    for (let i = 0; i < activeTestCases.length; i += CONCURRENCY) {
        const batch = activeTestCases.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(tc => processTestCase(tc)));
    }

    await browser.close();

    const totalDuration = (Date.now() - startTime) / 1000;
    const precision = results.tp / (results.tp + results.fp) || 0;
    const recall = results.tp / (results.tp + results.fn) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;
    const avgTime = (results.totalTime / results.count) / 1000;

    console.log('\n--- axe-core Benchmark results ---');
    console.log(`Total test cases processed: ${results.count}`);
    console.log(`True Positives (TP): ${results.tp}`);
    console.log(`False Positives (FP): ${results.fp}`);
    console.log(`False Negatives (FN): ${results.fn}`);
    console.log(`True Negatives (TN): ${results.tn}`);
    console.log(`Precision: ${precision.toFixed(4)}`);
    console.log(`Recall: ${recall.toFixed(4)}`);
    console.log(`F1-Score: ${f1.toFixed(4)}`);
    console.log(`Average Time per URL: ${avgTime.toFixed(4)}s`);
    console.log(`Total Execution Time: ${totalDuration.toFixed(2)}s`);
}

runBenchmark().catch(console.error);
