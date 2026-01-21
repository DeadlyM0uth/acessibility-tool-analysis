'use strict';

const fs = require('fs');
const { QualWeb } = require('@qualweb/core');
const { ACTRules } = require('@qualweb/act-rules');

// Mapping from the user
const mapping = {
    'QW-ACT-R1': '2779a5',
    'QW-ACT-R2': 'b5c3f8',
    'QW-ACT-R3': '5b7ae0',
    'QW-ACT-R4': 'bc659a',
    'QW-ACT-R5': 'bf051a',
    'QW-ACT-R6': '59796f',
    'QW-ACT-R7': 'b33eff',
    'QW-ACT-R9': 'b20e66',
    'QW-ACT-R10': '4b1c6c',
    'QW-ACT-R11': '97a4e1',
    'QW-ACT-R12': 'c487ae',
    'QW-ACT-R13': '6cfa84',
    'QW-ACT-R14': 'b4f0c3',
    'QW-ACT-R15': '80f0bf',
    'QW-ACT-R16': 'e086e5',
    'QW-ACT-R17': '23a2a8',
    'QW-ACT-R18': '3ea0c8',
    'QW-ACT-R19': 'cae760',
    'QW-ACT-R20': '674b10',
    'QW-ACT-R21': '7d6734',
    'QW-ACT-R22': 'de46e4',
    'QW-ACT-R23': 'c5a4ea',
    'QW-ACT-R24': '73f2c2',
    'QW-ACT-R25': '5c01ea',
    'QW-ACT-R26': 'eac66b',
    'QW-ACT-R27': '5f99a7',
    'QW-ACT-R28': '4e8ab6',
    'QW-ACT-R29': 'e7aa44',
    'QW-ACT-R30': '2ee8b8',
    'QW-ACT-R31': 'c3232f',
    'QW-ACT-R32': '1ec09b',
    'QW-ACT-R33': 'ff89c9',
    'QW-ACT-R34': '6a7281',
    'QW-ACT-R35': 'ffd0e9',
    'QW-ACT-R36': 'a25f45',
    'QW-ACT-R37': 'afw4f7',
    'QW-ACT-R38': 'bc4a75',
    'QW-ACT-R39': 'd0f69e',
    'QW-ACT-R40': '59br37',
    'QW-ACT-R41': '36b590',
    'QW-ACT-R42': '8fc3b6',
    'QW-ACT-R43': '0ssw9k',
    'QW-ACT-R44': 'fd3a94',
    'QW-ACT-R48': '46ca7f',
    'QW-ACT-R49': 'aaa1bf',
    'QW-ACT-R50': '4c31df',
    'QW-ACT-R51': 'fd26cf',
    'QW-ACT-R52': 'ac7dc6',
    'QW-ACT-R53': 'ee13b5',
    'QW-ACT-R54': 'd7ba54',
    'QW-ACT-R55': '1ea59c',
    'QW-ACT-R56': 'ab4d13',
    'QW-ACT-R57': 'f196ce',
    'QW-ACT-R58': '2eb176',
    'QW-ACT-R59': 'afb423',
    'QW-ACT-R60': 'f51b46',
    'QW-ACT-R61': '1a02b0',
    'QW-ACT-R62': 'oj04fd',
    'QW-ACT-R63': 'b40fd1',
    'QW-ACT-R64': '047fe0',
    'QW-ACT-R65': '307n5z',
    'QW-ACT-R66': 'm6b1q3',
    'QW-ACT-R67': '24afc2',
    'QW-ACT-R68': '78fd32',
    'QW-ACT-R69': '9e45ec',
    'QW-ACT-R70': 'akn7bn',
    'QW-ACT-R71': 'bisz58',
    'QW-ACT-R72': '8a213c',
    'QW-ACT-R73': '3e12e1',
    'QW-ACT-R74': 'ye5d6e',
    'QW-ACT-R75': 'cf77f2',
    'QW-ACT-R76': '09o5cg'
};

// Inverse mapping for easy lookup
const actToQw = {};
for (const [qw, act] of Object.entries(mapping)) {
    actToQw[act] = qw;
}

const LIMIT = null; // Set to null for all test cases

async function runBenchmark() {
    const data = JSON.parse(fs.readFileSync('act-testcases.json', 'utf8'));
    let testcases = data.testcases.filter(tc => actToQw[tc.ruleId]);

    if (LIMIT) {
        testcases = testcases.slice(0, LIMIT);
    }

    console.log(`Found ${testcases.length} test cases for mapped rules.`);

    const qualweb = new QualWeb();
    await qualweb.start({ maxConcurrency: 5 }, { headless: true });

    const actRules = new ACTRules();

    const results = {
        tp: 0, fp: 0, fn: 0, tn: 0,
        totalTime: 0,
        count: 0
    };

    const startTime = Date.now();

    // Process in chunks to avoid overloading
    const chunkSize = 10;
    for (let i = 0; i < testcases.length; i += chunkSize) {
        const chunk = testcases.slice(i, i + chunkSize);
        const urls = chunk.map(tc => tc.url);

        console.log(`Processing chunk ${i / chunkSize + 1}/${Math.ceil(testcases.length / chunkSize)}...`);

        const chunkStartTime = Date.now();
        const reports = await qualweb.evaluate({
            urls,
            modules: [actRules]
        });
        const chunkEndTime = Date.now();
        results.totalTime += (chunkEndTime - chunkStartTime);

        for (const tc of chunk) {
            const report = reports[tc.url];
            if (!report) {
                console.error(`No report for ${tc.url}`);
                continue;
            }

            const qwRuleId = actToQw[tc.ruleId];
            const assertion = report.modules['act-rules'].assertions[qwRuleId];

            let outcome = 'inapplicable';
            if (assertion) {
                outcome = assertion.metadata.outcome;
            }

            const expected = tc.expected; // 'passed', 'failed', 'inapplicable'

            if (expected === 'failed') {
                if (outcome === 'failed') results.tp++;
                else results.fn++;
            } else if (expected === 'passed') {
                if (outcome === 'failed') results.fp++;
                else results.tn++;
            }

            results.count++;
        }
    }

    await qualweb.stop();

    const totalDuration = (Date.now() - startTime) / 1000;
    const precision = results.tp / (results.tp + results.fp) || 0;
    const recall = results.tp / (results.tp + results.fn) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;
    const avgTime = (results.totalTime / results.count) / 1000;

    console.log('\n--- Benchmark results ---');
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
