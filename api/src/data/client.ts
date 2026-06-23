import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export function makeDocClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({}));
}

export const TABLES = {
  profile: process.env.TABLE_PROFILE ?? "bio-profile",
  experience: process.env.TABLE_EXPERIENCE ?? "bio-experience",
  education: process.env.TABLE_EDUCATION ?? "bio-education",
  skills: process.env.TABLE_SKILLS ?? "bio-skills",
  projects: process.env.TABLE_PROJECTS ?? "bio-projects",
  posts: process.env.TABLE_POSTS ?? "bio-posts",
} as const;
