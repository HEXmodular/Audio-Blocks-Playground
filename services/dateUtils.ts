/**
 * This utility module provides functions related to date manipulation and formatting, primarily for generating seeds or date-based identifiers.
 * It contains the `getCurrentDateAsSeed` function, which takes the current calendar date (year, month, day).
 * This function then formats the date components into a single integer in the YYYYMMDD format.
 * The resulting number is intended for use as a seed for processes requiring deterministic initialization based on the current day.
 * For example, it can be used to seed random number generators or provide a daily unique identifier for AI content generation.
 */

export function getCurrentDateAsSeed(): number {
  const date = new Date();
  // Simple seed: YYYYMMDD
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // getMonth() is 0-indexed
  const day = date.getDate();
  
  // Combine into a number, e.g., 20231225
  return parseInt(`${year}${month < 10 ? '0' : ''}${month}${day < 10 ? '0' : ''}${day}`, 10);
}
