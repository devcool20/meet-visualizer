import { cacheService } from '../services/cache.js';
import { notionService } from '../services/notion.js';
import { geminiService } from '../services/gemini.js';

async function runTests() {
  console.log('==================================================');
  console.log('       RUNNING BACKEND PIPELINE AUTOMATED TESTS   ');
  console.log('==================================================');

  let testPassed = true;

  // Test 1: Cache Service verification
  console.log('\n[Test 1] Verifying Cache Service...');
  try {
    await cacheService.set('test:key', 'test_value');
    const val = await cacheService.get('test:key');
    if (val === 'test_value') {
      console.log('✓ Cache Service Set/Get: Success');
    } else {
      console.error('✗ Cache Service Set/Get: Failed, got:', val);
      testPassed = false;
    }
  } catch (err) {
    console.error('✗ Cache Service Error:', err);
    testPassed = false;
  }

  // Test 2: Notion Sync verification
  console.log('\n[Test 2] Verifying Notion Sync Pipeline...');
  try {
    await notionService.sync();
    const hasFinancials = await cacheService.exists('notion:q2_financials');
    const hasArchitecture = await cacheService.exists('notion:sys_architecture_v2');
    const hasSecurity = await cacheService.exists('notion:security_compliance');

    if (hasFinancials && hasArchitecture && hasSecurity) {
      console.log('✓ Notion Cache Pre-fetching: Success');
    } else {
      console.error('✗ Notion Cache Pre-fetching: Failed to sync all keys. Found:', {
        hasFinancials,
        hasArchitecture,
        hasSecurity
      });
      testPassed = false;
    }
  } catch (err) {
    console.error('✗ Notion Sync Error:', err);
    testPassed = false;
  }

  // Test 3: Gemini Intent Parser & Pre-warming Buffer
  console.log('\n[Test 3] Verifying Gemini Speech parsing & pre-warming...');
  try {
    let preWarmFired = false;
    let actionFired = false;
    let triggeredAnchor = '';

    geminiService.onPreWarm((anchor) => {
      console.log(`  └─ Pre-warm event intercepted for anchor: "${anchor}"`);
      preWarmFired = true;
    });

    geminiService.onAction((anchor, response) => {
      console.log(`  └─ Action intent confirmed for anchor: "${anchor}" | Type: ${response.target_visualization_type}`);
      actionFired = true;
      triggeredAnchor = anchor;
    });

    // Feed a token stream simulating a speaker talking about financial growth
    geminiService.clearBuffer();
    console.log('-> Feeding token: "as we look at our financial growth charts"');
    await geminiService.processSpeechToken('as we look at our financial growth charts');

    if (preWarmFired && actionFired && triggeredAnchor === 'q2_financials') {
      console.log('✓ Gemini Intent Parsing and Pre-warming: Success');
    } else {
      console.error('✗ Gemini Ingest failed. preWarmFired:', preWarmFired, 'actionFired:', actionFired, 'anchor:', triggeredAnchor);
      testPassed = false;
    }
  } catch (err) {
    console.error('✗ Gemini Service Error:', err);
    testPassed = false;
  }

  // Test 4: Low Confidence Suppression Gate
  console.log('\n[Test 4] Verifying Gemini Low Confidence Suppression Gate...');
  try {
    let gateActionFired = false;
    
    // Register temporary action listener
    const tempListener = () => {
      gateActionFired = true;
    };
    geminiService.onAction(tempListener);

    // Feed a phrase that is ambiguous ("charts") which fires a 0.72 confidence score
    geminiService.clearBuffer();
    console.log('-> Feeding low-confidence ambiguous word: "charts"');
    await geminiService.processSpeechToken('charts');

    if (!gateActionFired) {
      console.log('✓ Gemini Confidence Gate correctly suppressed render for confidence < 0.88: Success');
    } else {
      console.error('✗ Gemini Confidence Gate failed: action fired despite low confidence score.');
      testPassed = false;
    }
  } catch (err) {
    console.error('✗ Confidence Gate Error:', err);
    testPassed = false;
  }

  console.log('\n==================================================');
  if (testPassed) {
    console.log('       ALL TESTS COMPLETED SUCCESSFULLY (PASSED)   ');
    console.log('==================================================');
    process.exit(0);
  } else {
    console.log('       TEST SUITE COMPLETED WITH FAILURES (FAILED)  ');
    console.log('==================================================');
    process.exit(1);
  }
}

runTests();
