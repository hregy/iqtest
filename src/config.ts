// Central tuning knobs for the test.
export const TEST_LENGTH = 20;          // questions per attempt
export const POOL_SIZE = 100;           // size of the full dataset
export const QUESTION_SECONDS = 10;     // time allowed per question
export const ONE_ATTEMPT_LOCK = false;  // if true, a device can only take the test once
export const LOCK_STORAGE_KEY = "iq-test-completed";
