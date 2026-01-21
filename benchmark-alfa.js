'use strict';

const fs = require('fs');
const puppeteer = require('puppeteer');
const { Puppeteer } = require('@siteimprove/alfa-puppeteer');
const { Audit } = require('@siteimprove/alfa-act');
const { Rules } = require('@siteimprove/alfa-rules');

// Load mappings and test cases
const alfaMapping = JSON.parse(fs.readFileSync('alfa-to-act-mapping.json', 'utf8'));
const actData = JSON.parse(fs.readFileSync('act-testcases.json', 'utf8'));

// Filter test cases that have a mapping in alfa
const testcases = actData.testcases.filter(tc => alfaMapping[tc.ruleId]);

const LIMIT = null; // Set to null for all test cases
const activeTestCases = LIMIT ? testcases.slice(0, LIMIT) : testcases;
const CONCURRENCY = 5;

console.log(`Found ${activeTestCases.length} test cases for siteimprove/alfa mapped rules.`);

async function runBenchmark() {
    const browser = await puppeteer.launch({ headless: true });

    // Convert rules to an array if it's not already
    const allRules = Array.from(Rules.values());

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
            await page.goto(tc.url, { waitUntil: 'load', timeout: 20000 });

            // Convert to Alfa Page
            const alfaPage = await Puppeteer.toPage(page);

            // Run Audit
            const outcomes = await Audit.of(alfaPage, allRules).evaluate();
            const urlEndTime = Date.now();

            const alfaRuleIds = alfaMapping[tc.ruleId];

            // Check outcomes for the specific rule(s)
            let isFailed = false;
            let isPassed = false;

            for (const outcome of outcomes) {
                if (alfaRuleIds.includes(outcome.rule.uri.split('/').pop())) {
                    if (outcome.constructor.name === 'Failed') {
                        isFailed = true;
                    } else if (outcome.constructor.name === 'Passed') {
                        isPassed = true;
                    }
                }
            }

            let outcomeLabel = 'inapplicable';
            if (isFailed) outcomeLabel = 'failed';
            else if (isPassed) outcomeLabel = 'passed';

            const expected = tc.expected; // 'passed', 'failed', 'inapplicable'

            if (expected === 'failed') {
                if (outcomeLabel === 'failed') results.tp++;
                else results.fn++;
            } else if (expected === 'passed') {
                if (outcomeLabel === 'failed') results.fp++;
                else results.tn++;
            }

            results.totalTime += (urlEndTime - urlStartTime);
            results.count++;

            if (results.count % 10 === 0) {
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

    console.log('\n--- siteimprove/alfa Benchmark results ---');
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
