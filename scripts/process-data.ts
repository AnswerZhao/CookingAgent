import * as dotenv from 'dotenv';
import { RecipeParser } from './data-processing/RecipeParser';
import { LLMBasedTagger } from './data-processing/LLMBasedTagger';
import { DatabaseBuilder } from './data-processing/DatabaseBuilder';

// Load environment variables
dotenv.config();

async function main() {
  console.log('=== CookingAgent Data Processing Pipeline ===');
  console.log('Starting data processing...\n');

  try {
    // Step 1: Parse all recipes from HowToCook
    console.log('📖 Step 1: Parsing recipes from HowToCook...');
    const parser = new RecipeParser('./HowToCook');
    const rawRecipes = await parser.parseAllRecipes();
    console.log(`Parsed ${rawRecipes.length} recipes\n`);

    // Step 2: Load existing data and tag recipes incrementally
    console.log('🏷️  Step 2: Tagging recipes with LLM...');
    const tagger = new LLMBasedTagger();
    const databaseBuilder = new DatabaseBuilder('./data');
    
    const existingData = await databaseBuilder.loadExistingData();
    console.log(`Found ${Object.keys(existingData).length} existing processed recipes`);
    
    const processedRecipes = await tagger.tagRecipesIncremental(rawRecipes, existingData);
    console.log(`Processed ${processedRecipes.length} recipes total\n`);

    // Step 3: Build databases
    console.log('💾 Step 3: Building databases...');
    await databaseBuilder.buildDatabases(processedRecipes);
    console.log('Databases built successfully!\n');

    console.log('✅ Data processing pipeline completed successfully!');
    console.log('You can now run the CookingAgent with: npm run dev');

  } catch (error) {
    console.error('❌ Error in data processing pipeline:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Process interrupted by user');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main();
}