import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Roughly the center of a mid-size Russian regional city; seeded orders are
// scattered a few km around this point.
const CITY_CENTER = { lat: 54.5293, lng: 36.2754 };

function jitter(base: number, maxDegrees: number): number {
  return base + (Math.random() * 2 - 1) * maxDegrees;
}

async function setLocation(orderId: string, lat: number, lng: number) {
  await prisma.$executeRaw`
    UPDATE orders
    SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    WHERE id = ${orderId}
  `;
}

async function main() {
  console.log('Seeding categories...');
  const remont = await prisma.category.create({ data: { name: 'Ремонт' } });
  const electrics = await prisma.category.create({
    data: { name: 'Электрика', parentId: remont.id },
  });
  const plumbing = await prisma.category.create({
    data: { name: 'Сантехника', parentId: remont.id },
  });
  const cleaning = await prisma.category.create({ data: { name: 'Уборка' } });
  const delivery = await prisma.category.create({ data: { name: 'Доставка' } });

  console.log('Seeding users...');
  const customer1 = await prisma.user.create({
    data: {
      phone: '+79990000001',
      name: 'Анна Смирнова',
      customerProfile: { create: {} },
    },
  });
  const customer2 = await prisma.user.create({
    data: {
      phone: '+79990000002',
      name: 'Дмитрий Орлов',
      customerProfile: { create: {} },
    },
  });

  const worker1 = await prisma.user.create({
    data: {
      phone: '+79990000003',
      name: 'Иван Петров',
      activeMode: 'WORKER',
      customerProfile: { create: {} },
      workerProfile: {
        create: {
          description: 'Электрик с опытом 8 лет. Быстро и аккуратно.',
          rating: 4.8,
          reviewsCount: 2,
          completedOrdersCount: 1,
          categories: { create: [{ categoryId: electrics.id }, { categoryId: remont.id }] },
        },
      },
    },
  });
  const worker2 = await prisma.user.create({
    data: {
      phone: '+79990000004',
      name: 'Сергей Кузнецов',
      activeMode: 'WORKER',
      customerProfile: { create: {} },
      workerProfile: {
        create: {
          description: 'Сантехник, работаю без посредников.',
          rating: 4.5,
          reviewsCount: 1,
          completedOrdersCount: 1,
          categories: { create: [{ categoryId: plumbing.id }] },
        },
      },
    },
  });
  const worker3 = await prisma.user.create({
    data: {
      phone: '+79990000005',
      name: 'Мария Волкова',
      activeMode: 'WORKER',
      customerProfile: { create: {} },
      workerProfile: {
        create: {
          description: 'Уборка квартир и офисов.',
          rating: 0,
          reviewsCount: 0,
          completedOrdersCount: 0,
          categories: { create: [{ categoryId: cleaning.id }] },
        },
      },
    },
  });

  console.log('Seeding orders...');

  // OPEN order, no applications yet.
  const openOrder = await prisma.order.create({
    data: {
      customerId: customer1.id,
      categoryId: cleaning.id,
      title: 'Уборка двухкомнатной квартиры',
      description: 'Нужна генеральная уборка после ремонта.',
      initialPriceMinor: 350000,
      latitude: jitter(CITY_CENTER.lat, 0.03),
      longitude: jitter(CITY_CENTER.lng, 0.03),
      address: 'ул. Ленина, 10',
      requiredAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
  });
  await setLocation(openOrder.id, openOrder.latitude, openOrder.longitude);
  await prisma.orderEvent.create({
    data: { orderId: openOrder.id, actorUserId: customer1.id, type: 'ORDER_CREATED' },
  });

  // OPEN order with a couple of pending applications.
  const openOrderWithApps = await prisma.order.create({
    data: {
      customerId: customer2.id,
      categoryId: electrics.id,
      title: 'Замена проводки в комнате',
      description: 'Старая проводка, нужна полная замена.',
      initialPriceMinor: 800000,
      latitude: jitter(CITY_CENTER.lat, 0.03),
      longitude: jitter(CITY_CENTER.lng, 0.03),
      address: 'ул. Кирова, 25',
      requiredAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  });
  await setLocation(
    openOrderWithApps.id,
    openOrderWithApps.latitude,
    openOrderWithApps.longitude,
  );
  await prisma.orderEvent.create({
    data: { orderId: openOrderWithApps.id, actorUserId: customer2.id, type: 'ORDER_CREATED' },
  });
  await prisma.orderApplication.create({
    data: {
      orderId: openOrderWithApps.id,
      workerId: worker1.id,
      proposedPriceMinor: 750000,
      proposedTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      message: 'Могу начать завтра, есть все материалы.',
    },
  });

  // COMPLETED order with reviews both ways.
  const completedOrder = await prisma.order.create({
    data: {
      customerId: customer1.id,
      categoryId: electrics.id,
      title: 'Установка розеток на кухне',
      description: 'Нужно установить 4 розетки.',
      initialPriceMinor: 400000,
      agreedPriceMinor: 400000,
      latitude: jitter(CITY_CENTER.lat, 0.03),
      longitude: jitter(CITY_CENTER.lng, 0.03),
      address: 'ул. Гагарина, 5',
      requiredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      agreedWorkTime: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      status: 'COMPLETED',
      acceptedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      startedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      workSubmittedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000 + 3600000),
      completedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });
  await setLocation(completedOrder.id, completedOrder.latitude, completedOrder.longitude);

  const completedApplication = await prisma.orderApplication.create({
    data: {
      orderId: completedOrder.id,
      workerId: worker1.id,
      proposedPriceMinor: 400000,
      proposedTime: completedOrder.agreedWorkTime as Date,
      status: 'ACCEPTED',
    },
  });
  await prisma.order.update({
    where: { id: completedOrder.id },
    data: { selectedApplicationId: completedApplication.id },
  });

  const resultPhoto = await prisma.orderPhoto.create({
    data: {
      orderId: completedOrder.id,
      uploadedByUserId: worker1.id,
      type: 'WORKER_RESULT',
      objectKey: `orders/${completedOrder.id}/photos/seed-result-1`,
      contentType: 'image/jpeg',
      status: 'PUBLIC_PORTFOLIO',
      approvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.review.create({
    data: {
      orderId: completedOrder.id,
      authorUserId: customer1.id,
      targetUserId: worker1.id,
      targetRole: 'WORKER',
      rating: 5,
      comment: 'Отлично, быстро и аккуратно!',
    },
  });
  await prisma.review.create({
    data: {
      orderId: completedOrder.id,
      authorUserId: worker1.id,
      targetUserId: customer1.id,
      targetRole: 'CUSTOMER',
      rating: 5,
      comment: 'Заказчик на связи, всё чётко.',
    },
  });

  await prisma.orderEvent.createMany({
    data: [
      { orderId: completedOrder.id, actorUserId: customer1.id, type: 'ORDER_CREATED' },
      {
        orderId: completedOrder.id,
        actorUserId: customer1.id,
        type: 'WORKER_SELECTED',
        payload: { applicationId: completedApplication.id, workerId: worker1.id },
      },
      { orderId: completedOrder.id, actorUserId: worker1.id, type: 'ORDER_STARTED' },
      {
        orderId: completedOrder.id,
        actorUserId: worker1.id,
        type: 'PHOTO_UPLOADED',
        payload: { photoId: resultPhoto.id },
      },
      { orderId: completedOrder.id, actorUserId: worker1.id, type: 'WORK_SUBMITTED' },
      {
        orderId: completedOrder.id,
        actorUserId: customer1.id,
        type: 'PORTFOLIO_PHOTOS_APPROVED',
        payload: { approvedPhotoIds: [resultPhoto.id] },
      },
      { orderId: completedOrder.id, actorUserId: customer1.id, type: 'ORDER_COMPLETED' },
      {
        orderId: completedOrder.id,
        actorUserId: customer1.id,
        type: 'REVIEW_CREATED',
        payload: { targetUserId: worker1.id },
      },
      {
        orderId: completedOrder.id,
        actorUserId: worker1.id,
        type: 'REVIEW_CREATED',
        payload: { targetUserId: customer1.id },
      },
    ],
  });

  // A second completed order for worker2, for portfolio/history variety.
  const completedOrder2 = await prisma.order.create({
    data: {
      customerId: customer2.id,
      categoryId: plumbing.id,
      title: 'Замена смесителя в ванной',
      initialPriceMinor: 250000,
      agreedPriceMinor: 250000,
      latitude: jitter(CITY_CENTER.lat, 0.03),
      longitude: jitter(CITY_CENTER.lng, 0.03),
      address: 'ул. Пушкина, 3',
      requiredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      agreedWorkTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      status: 'COMPLETED',
      acceptedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      workSubmittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 3600000),
      completedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  });
  await setLocation(completedOrder2.id, completedOrder2.latitude, completedOrder2.longitude);
  const completedApplication2 = await prisma.orderApplication.create({
    data: {
      orderId: completedOrder2.id,
      workerId: worker2.id,
      proposedPriceMinor: 250000,
      proposedTime: completedOrder2.agreedWorkTime as Date,
      status: 'ACCEPTED',
    },
  });
  await prisma.order.update({
    where: { id: completedOrder2.id },
    data: { selectedApplicationId: completedApplication2.id },
  });
  await prisma.review.create({
    data: {
      orderId: completedOrder2.id,
      authorUserId: customer2.id,
      targetUserId: worker2.id,
      targetRole: 'WORKER',
      rating: 4,
      comment: 'Хорошо, но приехал с опозданием.',
    },
  });

  // CANCELLED order for variety.
  const cancelledOrder = await prisma.order.create({
    data: {
      customerId: customer2.id,
      categoryId: delivery.id,
      title: 'Доставка мебели с рынка',
      initialPriceMinor: 150000,
      latitude: jitter(CITY_CENTER.lat, 0.03),
      longitude: jitter(CITY_CENTER.lng, 0.03),
      requiredAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: 'Передумал, нашёл другой вариант',
      cancelledByUserId: customer2.id,
    },
  });
  await setLocation(cancelledOrder.id, cancelledOrder.latitude, cancelledOrder.longitude);
  await prisma.orderEvent.createMany({
    data: [
      { orderId: cancelledOrder.id, actorUserId: customer2.id, type: 'ORDER_CREATED' },
      {
        orderId: cancelledOrder.id,
        actorUserId: customer2.id,
        type: 'ORDER_CANCELLED',
        payload: { reason: 'Передумал, нашёл другой вариант' },
      },
    ],
  });

  console.log('Seed complete:');
  console.log(`  customers: ${customer1.name}, ${customer2.name}`);
  console.log(`  workers: ${worker1.name}, ${worker2.name}, ${worker3.name}`);
  console.log(`  orders: ${openOrder.id}, ${openOrderWithApps.id}, ${completedOrder.id}, ${completedOrder2.id}, ${cancelledOrder.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
