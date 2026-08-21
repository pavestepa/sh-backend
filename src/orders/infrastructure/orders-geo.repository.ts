import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PrismaTransactionClient } from '../../prisma/prisma.service';

export interface GeoSearchFilters {
  lat: number;
  lng: number;
  radiusM: number;
  categoryId?: string;
  status?: string;
  date?: Date;
  priceFromMinor?: number;
  priceToMinor?: number;
  limit: number;
  offset: number;
}

export interface GeoSearchRow {
  id: string;
  distanceM: number;
}

/**
 * Prisma cannot write or query the PostGIS `geography` column directly, so
 * both the write-side sync and the distance search live here as raw SQL.
 * Everything else about Order reads/writes goes through the normal Prisma
 * client.
 */
@Injectable()
export class OrdersGeoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async syncLocation(
    tx: PrismaTransactionClient,
    orderId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE orders
      SET location = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      WHERE id = ${orderId}
    `;
  }

  async searchNearby(filters: GeoSearchFilters): Promise<GeoSearchRow[]> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`ST_DWithin(location, ST_SetSRID(ST_MakePoint(${filters.lng}, ${filters.lat}), 4326)::geography, ${filters.radiusM})`,
    ];

    if (filters.status) {
      conditions.push(Prisma.sql`status = ${filters.status}::"OrderStatus"`);
    }
    if (filters.categoryId) {
      conditions.push(Prisma.sql`"categoryId" = ${filters.categoryId}`);
    }
    if (filters.priceFromMinor !== undefined) {
      conditions.push(
        Prisma.sql`"initialPriceMinor" >= ${filters.priceFromMinor}`,
      );
    }
    if (filters.priceToMinor !== undefined) {
      conditions.push(
        Prisma.sql`"initialPriceMinor" <= ${filters.priceToMinor}`,
      );
    }
    if (filters.date) {
      const dayStart = new Date(filters.date);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      conditions.push(
        Prisma.sql`"requiredAt" >= ${dayStart} AND "requiredAt" < ${dayEnd}`,
      );
    }

    const whereClause = Prisma.join(conditions, ' AND ');

    const rows = await this.prisma.$queryRaw<
      { id: string; distance_m: number }[]
    >`
      SELECT id, ST_Distance(location, ST_SetSRID(ST_MakePoint(${filters.lng}, ${filters.lat}), 4326)::geography) AS distance_m
      FROM orders
      WHERE ${whereClause}
      ORDER BY distance_m ASC
      LIMIT ${filters.limit}
      OFFSET ${filters.offset}
    `;

    return rows.map((r) => ({ id: r.id, distanceM: Math.round(r.distance_m) }));
  }
}
