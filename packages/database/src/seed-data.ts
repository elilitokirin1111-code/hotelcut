import type { DatabaseClient } from './client.js';
import { hashPassword } from '@hotelcut/auth';
import { brandKits, hotels, memberships, organizations, users } from './schema.js';

export const developmentSeed = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  userId: '20000000-0000-4000-8000-000000000001',
  hotelId: '30000000-0000-4000-8000-000000000001',
  brandKitId: '40000000-0000-4000-8000-000000000001',
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
      name: 'HotelCut 本地工作区',
      slug: 'hotelcut-local-workspace',
    })
    .onConflictDoNothing();

  await client.db
    .insert(users)
    .values({
      id: developmentSeed.userId,
      externalSubject: 'local-dev-owner',
      email: developmentSeed.email,
      passwordHash,
      displayName: '本地管理员',
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
      name: '我的酒店',
      city: '待配置',
      address: null,
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
      endingText: '欢迎了解酒店详情',
      contactText: null,
    })
    .onConflictDoNothing();
}
