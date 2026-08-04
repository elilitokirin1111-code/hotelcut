import type { DatabaseClient } from './client.js';
import { hashPassword } from '@hotelcut/auth';
import { brandKits, hotels, memberships, organizations, users, videoBriefs } from './schema.js';

export const developmentSeed = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  userId: '20000000-0000-4000-8000-000000000001',
  hotelId: '30000000-0000-4000-8000-000000000001',
  brandKitId: '40000000-0000-4000-8000-000000000001',
  videoBriefId: '50000000-0000-4000-8000-000000000001',
  email: 'owner@hotelcut.example',
  password: 'hotelcut-local',
} as const;

export async function seedDevelopmentData(
  client: DatabaseClient,
  password: string = developmentSeed.password,
): Promise<void> {
  const passwordHash = await hashPassword(password);

  await client.db
    .insert(organizations)
    .values({
      id: developmentSeed.organizationId,
      name: '云栖酒店集团（演示）',
      slug: 'cloud-rest-demo',
    })
    .onConflictDoNothing();

  await client.db
    .insert(users)
    .values({
      id: developmentSeed.userId,
      externalSubject: 'local-dev-owner',
      email: developmentSeed.email,
      passwordHash,
      displayName: '演示管理员',
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { passwordHash, updatedAt: new Date() },
    });

  await client.db
    .insert(memberships)
    .values({
      id: '21000000-0000-4000-8000-000000000001',
      organizationId: developmentSeed.organizationId,
      userId: developmentSeed.userId,
      role: 'owner',
    })
    .onConflictDoNothing();

  await client.db
    .insert(hotels)
    .values({
      id: developmentSeed.hotelId,
      organizationId: developmentSeed.organizationId,
      name: '云栖湖畔酒店（虚构）',
      city: '杭州',
      address: '示例路 88 号',
      timezone: 'Asia/Shanghai',
    })
    .onConflictDoNothing();

  await client.db
    .insert(brandKits)
    .values({
      id: developmentSeed.brandKitId,
      hotelId: developmentSeed.hotelId,
      primaryColor: '#17324D',
      secondaryColor: '#F5EFE6',
      accentColor: '#C99A5B',
      fontFamily: 'Noto Sans SC',
      subtitleStyle: 'clean',
      endingText: '在湖畔，住进一段慢时光',
      contactText: '400-000-0000（演示）',
    })
    .onConflictDoNothing();

  await client.db
    .insert(videoBriefs)
    .values({
      id: developmentSeed.videoBriefId,
      hotelId: developmentSeed.hotelId,
      title: '湖畔周末度假推广',
      platform: 'douyin',
      durationSeconds: 30,
      aspectRatio: '9:16',
      tone: '温暖松弛',
      language: 'zh-CN',
      objective: '展示虚构酒店的湖景客房与早餐',
      targetAudience: '周末短途度假的城市情侣',
      callToAction: '收藏并预约周末入住',
    })
    .onConflictDoNothing();
}
