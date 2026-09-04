/**
 * KIVO seed — realistic demo data.
 * Run: bun prisma/seed.ts
 * Demo login: maya@kivo.app / KivoDemo1!
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

async function main() {
  console.log("Seeding KIVO…");

  // Clean slate (order matters for FKs)
  await db.$transaction([
    db.notification.deleteMany(),
    db.momentReaction.deleteMany(),
    db.momentView.deleteMany(),
    db.pollVote.deleteMany(),
    db.pollOption.deleteMany(),
    db.poll.deleteMany(),
    db.commentReaction.deleteMany(),
    db.comment.deleteMany(),
    db.reaction.deleteMany(),
    db.savedPost.deleteMany(),
    db.collection.deleteMany(),
    db.postHashtag.deleteMany(),
    db.hashtag.deleteMany(),
    db.postMedia.deleteMany(),
    db.post.deleteMany(),
    db.moment.deleteMany(),
    db.spaceMember.deleteMany(),
    db.space.deleteMany(),
    db.followRequest.deleteMany(),
    db.follow.deleteMany(),
    db.session.deleteMany(),
    db.passwordReset.deleteMany(),
    db.profile.deleteMany(),
    db.user.deleteMany(),
  ]);

  const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "KivoDemo1!";
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 11);

  const users = await Promise.all(
    (
      [
        { email: "maya@kivo.app", username: "maya", fullName: "Maya Rahman", bio: "Product designer crafting calm interfaces ✨ Coffee-first thinker.", mood: "Building something 🚀", avatar: "/uploads/avatars/seed/maya.png", cover: "/uploads/covers/seed/cover-warm.png" },
        { email: "rafid@kivo.app", username: "rafid", fullName: "Rafid Hasan", bio: "Security researcher @ Cybersecurity Bangladesh. Break things, then fix them.", mood: "Hunting bugs 🐛", avatar: "/uploads/avatars/seed/rafid.png", cover: null },
        { email: "nabila@kivo.app", username: "nabila", fullName: "Nabila Ahmed", bio: "Photographer chasing golden hour. Street stories in frames.", mood: "Out shooting 📷", avatar: "/uploads/avatars/seed/nabila.png", cover: "/uploads/covers/seed/cover-night.png" },
        { email: "tanvir@kivo.app", username: "tanvir", fullName: "Tanvir Chowdhury", bio: "Gamer · streamer · FPS addict. GG in the chat.", mood: "Ranked grind 🎮", avatar: "/uploads/avatars/seed/tanvir.png", cover: null },
        { email: "sadia@kivo.app", username: "sadia", fullName: "Sadia Islam", bio: "Full-stack dev. TypeScript, good APIs, and clean commits.", mood: "Shipping features ⚡", avatar: "/uploads/avatars/seed/sadia.png", cover: null },
        { email: "arif@kivo.app", username: "arif", fullName: "Arif Mahmud", bio: "Street food explorer. If it steams, I'll try it. 🍜", mood: "Eating well 🍜", avatar: "/uploads/avatars/seed/arif.png", cover: null },
      ] as const
    ).map(async (u) =>
      db.user.create({
        data: {
          email: u.email,
          passwordHash,
          createdAt: hoursAgo(24 * 90),
          profile: {
            create: {
              username: u.username,
              fullName: u.fullName,
              bio: u.bio,
              mood: u.mood,
              avatarUrl: u.avatar,
              coverUrl: u.cover,
              createdAt: hoursAgo(24 * 90),
            },
          },
        },
        include: { profile: true },
      }),
    ),
  );

  const byUsername = Object.fromEntries(users.map((u) => [u.profile!.username, u]));
  const maya = byUsername["maya"];
  const rafid = byUsername["rafid"];
  const nabila = byUsername["nabila"];
  const tanvir = byUsername["tanvir"];
  const sadia = byUsername["sadia"];
  const arif = byUsername["arif"];

  // ── Follows ────────────────────────────────────────────────────────────────
  const follows: [string, string][] = [
    ["maya", "rafid"], ["maya", "nabila"], ["maya", "sadia"], ["maya", "arif"],
    ["rafid", "maya"], ["rafid", "tanvir"], ["rafid", "sadia"],
    ["nabila", "maya"], ["nabila", "sadia"], ["nabila", "arif"],
    ["tanvir", "rafid"], ["tanvir", "arif"], ["tanvir", "maya"],
    ["sadia", "maya"], ["sadia", "nabila"], ["sadia", "rafid"],
    ["arif", "nabila"], ["arif", "tanvir"], ["arif", "maya"],
  ];
  for (const [follower, following] of follows) {
    await db.follow.create({
      data: {
        followerId: byUsername[follower].id,
        followingId: byUsername[following].id,
        createdAt: hoursAgo(24 * 30),
      },
    });
  }

  // ── Spaces ─────────────────────────────────────────────────────────────────
  async function makeSpace(
    slug: string,
    name: string,
    description: string,
    ownerId: string,
    cover: string | null,
    memberIds: string[],
    rules: string,
    announcement: string,
    createdAt: Date,
  ) {
    return db.space.create({
      data: {
        slug, name, description, coverUrl: cover,
        rules, announcement,
        createdById: ownerId,
        createdAt, updatedAt: createdAt,
        members: {
          create: [
            { userId: ownerId, role: "OWNER", createdAt },
            ...memberIds.filter((id) => id !== ownerId).map((userId) => ({ userId, role: "MEMBER", createdAt })),
          ],
        },
      },
    });
  }

  const spCyber = await makeSpace(
    "cybersecurity-bd", "Cybersecurity Bangladesh",
    "For Bangladeshi security enthusiasts — CVEs, CTFs, career paths and defensive practices. Bilingual threads welcome.",
    rafid.id, "/uploads/space-media/seed/cyber-cover.png",
    [maya.id, tanvir.id, sadia.id],
    "1. No exploit dumps against live targets.\n2. Ask questions with context — logs help.\n3. Share responsibly: responsible disclosure only.",
    "📢 Monthly CTF practice this Friday — beginners welcome!",
    hoursAgo(24 * 60),
  );
  const spWeb = await makeSpace(
    "web-development", "Web Development",
    "Everything web — frameworks, performance, CSS wizardry, and shipping real products.",
    sadia.id, null,
    [maya.id, rafid.id],
    "1. Code blocks over screenshots.\n2. No framework wars. Ship things instead.",
    "",
    hoursAgo(24 * 45),
  );
  const spPhoto = await makeSpace(
    "photography", "Photography",
    "From phone snaps to full frames — critique, locations, and light.",
    nabila.id, "/uploads/space-media/seed/photo-cover.png",
    [maya.id, arif.id],
    "1. EXIF data welcome.\n2. Critique kindly, receive openly.",
    "",
    hoursAgo(24 * 50),
  );
  const spGaming = await makeSpace(
    "gaming-lounge", "Gaming Lounge",
    "Squad finder, patch notes drama, and cozy single-player chat.",
    tanvir.id, "/uploads/space-media/seed/gaming-cover.png",
    [rafid.id, arif.id],
    "1. No spoilers past 48h after release.\n2. Keep it GG.",
    "",
    hoursAgo(24 * 40),
  );

  // ── Hashtag sync helper ────────────────────────────────────────────────────
  async function syncTags(postId: string, content: string) {
    const tags = new Set<string>();
    for (const m of content.matchAll(/#([a-zA-Z0-9_]{1,40})/g)) tags.add(m[1].toLowerCase());
    for (const tag of tags) {
      const h = await db.hashtag.upsert({ where: { tag }, update: {}, create: { tag } });
      await db.postHashtag.create({ data: { postId, hashtagId: h.id } });
    }
  }

  // ── Posts ──────────────────────────────────────────────────────────────────
  async function makePost(opts: {
    authorId: string;
    content: string;
    privacy?: "PUBLIC" | "FOLLOWERS" | "ONLY_ME";
    feeling?: string;
    createdAt: Date;
    spaceId?: string;
    media?: { url: string; type?: "image" | "video" }[];
    poll?: string[];
    linkUrl?: string;
    linkTitle?: string;
    linkDescription?: string;
  }) {
    return db.post.create({
      data: {
        authorId: opts.authorId,
        content: opts.content,
        privacy: opts.privacy ?? "PUBLIC",
        feeling: opts.feeling,
        spaceId: opts.spaceId,
        linkUrl: opts.linkUrl,
        linkTitle: opts.linkTitle,
        linkDescription: opts.linkDescription,
        createdAt: opts.createdAt,
        updatedAt: opts.createdAt,
        media: {
          create: (opts.media ?? []).map((m, i) => ({
            url: m.url, type: m.type ?? "image", position: i, width: 1344, height: 768,
          })),
        },
        poll: opts.poll
          ? { create: { options: { create: opts.poll.map((text, position) => ({ text, position })) } } }
          : undefined,
      },
    });
  }

  const p1 = await makePost({
    authorId: maya.id,
    content: "Hot take: the best social feed is the one that respects your attention. Chronological, calm, no shouting.\n\nWe built KIVO around that idea. What would YOUR clean feed look like? #KIVO #Design",
    feeling: "🚀 ship-it mode",
    createdAt: hoursAgo(2),
  });
  const p2 = await makePost({
    authorId: nabila.id,
    content: "Golden hour never misses. Dhaka rooftops hit different before the city wakes up. #Photography #Bangladesh",
    media: [{ url: "/uploads/post-media/seed/dhaka.png" }],
    createdAt: hoursAgo(5),
  });
  const p3 = await makePost({
    authorId: rafid.id,
    content: "Reminder: your password manager is only as strong as the device it runs on. Patch, then panic. #CyberSecurity",
    createdAt: hoursAgo(8),
  });
  const p4 = await makePost({
    authorId: sadia.id,
    content: "Spent the morning refactoring a 900-line component into 4 small ones. My future self says thanks. Clean code is self-care. #WebDev",
    feeling: "🧠 focused",
    media: [{ url: "/uploads/post-media/seed/desk.png" }],
    createdAt: hoursAgo(11),
  });
  const p5 = await makePost({
    authorId: tanvir.id,
    content: "Which platform deserves your hours this winter?",
    poll: ["Cozy single-player RPG", "Competitive FPS grind", "Indie gems only", "Retro emulation"],
    createdAt: hoursAgo(9),
  });
  const p6 = await makePost({
    authorId: arif.id,
    content: "Found a biryani place that opens at 6am. Six. In the morning. Worth it. Zero regrets. 🍛",
    feeling: "😊 happy",
    createdAt: hoursAgo(26),
  });
  const p7 = await makePost({
    authorId: rafid.id,
    content: "Locked-in weekend: building a home lab for the CTF team. Followers get the writeup first. #CyberSecurity #Bangladesh",
    privacy: "FOLLOWERS",
    createdAt: hoursAgo(20),
  });
  const p8 = await makePost({
    authorId: maya.id,
    content: "Reading list I keep coming back to — Refactoring UI is still the best money I spent on design. https://www.refactoringui.com",
    linkUrl: "https://www.refactoringui.com",
    linkTitle: "Refactoring UI",
    linkDescription: "Learn how to design beautiful, intuitive interfaces by yourself — from a product designer & bootstrapped founder.",
    createdAt: hoursAgo(30),
  });
  const p9 = await makePost({
    authorId: nabila.id,
    content: "My desk is 40% camera gear at this point. No regrets. #Photography",
    media: [{ url: "/uploads/post-media/seed/photography.png" }],
    createdAt: hoursAgo(3),
  });
  const p10 = await makePost({
    authorId: tanvir.id,
    content: "Space night idea: community watch party for the finals? Drop your region so we can pick a time. #Gaming",
    spaceId: spGaming.id,
    createdAt: hoursAgo(4),
  });
  const p11 = await makePost({
    authorId: sadia.id,
    content: "PSA for web devs: shipping > debating. A median product in production beats a perfect one in your head. #WebDev #KIVO",
    spaceId: spWeb.id,
    createdAt: hoursAgo(6),
  });
  const p12 = await makePost({
    authorId: maya.id,
    content: "Private note to self: the moment viewer transitions feel *just right* now. Small wins.",
    privacy: "ONLY_ME",
    createdAt: hoursAgo(40),
  });

  const allPosts = { p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11 };
  for (const post of Object.values(allPosts)) await syncTags(post.id, post.content);

  // ── Reactions ──────────────────────────────────────────────────────────────
  const reactions: [string, string, string][] = [
    ["rafid", "p1", "LOVE"], ["nabila", "p1", "LOVE"], ["sadia", "p1", "FIRE"], ["tanvir", "p1", "WOW"], ["arif", "p1", "SUPPORT"],
    ["maya", "p2", "LOVE"], ["arif", "p2", "WOW"], ["sadia", "p2", "LOVE"], ["rafid", "p2", "FIRE"],
    ["maya", "p3", "SUPPORT"], ["tanvir", "p3", "FIRE"], ["sadia", "p3", "SUPPORT"],
    ["maya", "p4", "FIRE"], ["nabila", "p4", "LOVE"], ["rafid", "p4", "FUNNY"],
    ["maya", "p5", "FUNNY"], ["rafid", "p5", "LOVE"], ["nabila", "p5", "WOW"],
    ["nabila", "p6", "FUNNY"], ["tanvir", "p6", "FUNNY"], ["maya", "p6", "LOVE"],
    ["maya", "p9", "LOVE"], ["arif", "p9", "LOVE"], ["sadia", "p9", "WOW"],
    ["maya", "p10", "FIRE"], ["arif", "p10", "LOVE"], ["rafid", "p10", "SUPPORT"],
    ["maya", "p11", "SUPPORT"], ["rafid", "p11", "FIRE"], ["nabila", "p11", "LOVE"],
    ["sadia", "p8", "LOVE"], ["nabila", "p8", "SUPPORT"],
  ];
  for (const [who, post, type] of reactions) {
    await db.reaction.create({
      data: { userId: byUsername[who].id, postId: allPosts[post as keyof typeof allPosts].id, type },
    }).catch(() => {});
  }

  // ── Comments + replies ─────────────────────────────────────────────────────
  const c1 = await db.comment.create({ data: { postId: p1.id, authorId: sadia.id, content: "Chronological feeds are the only honest ones. 👏", createdAt: minutesAgo(100) } });
  const c1r1 = await db.comment.create({ data: { postId: p1.id, authorId: maya.id, parentId: c1.id, content: "@sadia honesty was the whole design brief 😄", createdAt: minutesAgo(90) } });
  const c1r2 = await db.comment.create({ data: { postId: p1.id, authorId: rafid.id, parentId: c1.id, content: "Seconded. My brain feels quieter already.", createdAt: minutesAgo(80) } });
  const c2 = await db.comment.create({ data: { postId: p1.id, authorId: nabila.id, content: "A feed where photographers don't fight an algorithm? Take my follow. #KIVO", createdAt: minutesAgo(60) } });
  const c3 = await db.comment.create({ data: { postId: p2.id, authorId: maya.id, content: "This looks unreal — what lens?", createdAt: minutesAgo(240) } });
  const c3r1 = await db.comment.create({ data: { postId: p2.id, authorId: nabila.id, parentId: c3.id, content: "@maya the 35mm f/1.8, my everyday hero!", createdAt: minutesAgo(200) } });
  const c4 = await db.comment.create({ data: { postId: p4.id, authorId: rafid.id, content: "900 lines?! Was it one file or a lifestyle?", createdAt: minutesAgo(500) } });
  const c4r1 = await db.comment.create({ data: { postId: p4.id, authorId: sadia.id, parentId: c4.id, content: "@rafid a lifestyle. A cry for help, even.", createdAt: minutesAgo(480) } });
  const c5 = await db.comment.create({ data: { postId: p6.id, authorId: tanvir.id, content: "6am biryani is a personality trait and I respect it.", createdAt: minutesAgo(1400) } });
  const c6 = await db.comment.create({ data: { postId: p10.id, authorId: arif.id, content: "In! UTC+6 here, evenings work best.", createdAt: minutesAgo(180) } });

  await db.commentReaction.createMany({
    data: [
      { userId: maya.id, commentId: c1.id, type: "LOVE" },
      { userId: nabila.id, commentId: c1.id, type: "SUPPORT" },
      { userId: sadia.id, commentId: c1r1.id, type: "FUNNY" },
      { userId: maya.id, commentId: c3r1.id, type: "LOVE" },
      { userId: sadia.id, commentId: c4r1.id, type: "FUNNY" },
      { userId: tanvir.id, commentId: c5.id, type: "LOVE" },
      { userId: maya.id, commentId: c6.id, type: "SUPPORT" },
    ],
  });

  // ── Votes on the poll ──────────────────────────────────────────────────────
  const poll = await db.poll.findUnique({ where: { postId: p5.id }, include: { options: true } });
  if (poll) {
    const sorted = [...poll.options].sort((a, b) => a.position - b.position);
    const votes: [string, number][] = [["maya", 0], ["rafid", 1], ["nabila", 2], ["arif", 0]];
    for (const [who, idx] of votes) {
      await db.pollVote.create({
        data: { pollId: poll.id, optionId: sorted[idx]!.id, userId: byUsername[who].id },
      });
    }
  }

  // ── Moments (24h) ──────────────────────────────────────────────────────────
  async function makeMoment(opts: {
    authorId: string; type: "text" | "image" | "poll";
    content?: string; mediaUrl?: string; background?: string; createdAt: Date;
  }) {
    return db.moment.create({
      data: {
        authorId: opts.authorId,
        type: opts.type,
        content: opts.content ?? "",
        mediaUrl: opts.mediaUrl,
        mediaType: opts.mediaUrl ? "image" : null,
        background: opts.background,
        expiresAt: new Date(opts.createdAt.getTime() + DAY),
        createdAt: opts.createdAt,
      },
    });
  }

  const m1 = await makeMoment({ authorId: nabila.id, type: "image", content: "street food run 🌙", mediaUrl: "/uploads/moment-media/seed/street-food.png", createdAt: minutesAgo(120) });
  const m2 = await makeMoment({ authorId: maya.id, type: "image", content: "cha break ☕", mediaUrl: "/uploads/moment-media/seed/cha.png", createdAt: minutesAgo(60) });
  const m3 = await makeMoment({ authorId: arif.id, type: "image", content: "sunrise crew 🌅", mediaUrl: "/uploads/moment-media/seed/sunrise.png", createdAt: minutesAgo(200) });
  const m4 = await makeMoment({ authorId: maya.id, type: "text", content: "Shipping day. Wish me luck ✨", background: "ember", createdAt: minutesAgo(30) });

  const viewPairs: [string, string][] = [
    ["maya", "m1"], ["arif", "m1"], ["rafid", "m1"],
    ["nabila", "m2"], ["sadia", "m2"], ["rafid", "m2"],
    ["nabila", "m3"], ["tanvir", "m3"], ["maya", "m3"],
    ["nabila", "m4"], ["sadia", "m4"],
  ];
  for (const [who, moment] of viewPairs) {
    await db.momentView.create({ data: { momentId: { m1, m2, m3, m4 }[moment as "m1"]!.id, userId: byUsername[who].id } });
  }
  await db.momentReaction.createMany({
    data: [
      { momentId: m2.id, userId: nabila.id, type: "LOVE" },
      { momentId: m2.id, userId: sadia.id, type: "FIRE" },
      { momentId: m1.id, userId: maya.id, type: "WOW" },
      { momentId: m3.id, userId: tanvir.id, type: "FIRE" },
    ],
  });

  // ── Collections + saved ────────────────────────────────────────────────────
  const colSec = await db.collection.create({ data: { userId: maya.id, name: "Cybersecurity", createdAt: hoursAgo(24 * 10) } });
  const colInspo = await db.collection.create({ data: { userId: maya.id, name: "Inspiration", createdAt: hoursAgo(24 * 9) } });
  await db.savedPost.createMany({
    data: [
      { userId: maya.id, postId: p3.id, collectionId: colSec.id, createdAt: hoursAgo(7) },
      { userId: maya.id, postId: p7.id, collectionId: colSec.id, createdAt: hoursAgo(6) },
      { userId: maya.id, postId: p2.id, collectionId: colInspo.id, createdAt: hoursAgo(4) },
      { userId: maya.id, postId: p4.id, collectionId: colInspo.id, createdAt: hoursAgo(2) },
    ],
  });

  // ── Notifications (some unread for maya) ───────────────────────────────────
  await db.notification.createMany({
    data: [
      { userId: maya.id, actorId: arif.id, type: "follow", createdAt: minutesAgo(25) },
      { userId: maya.id, actorId: nabila.id, type: "reaction", postId: p1.id, preview: "Love", createdAt: minutesAgo(40) },
      { userId: maya.id, actorId: sadia.id, type: "comment", postId: p1.id, preview: "Chronological feeds are the only honest ones. 👏", createdAt: minutesAgo(100) },
      { userId: maya.id, actorId: rafid.id, type: "mention", postId: p7.id, postPreview: "Locked-in weekend: building a home lab…", preview: "@maya want to break this home lab later? 😄", createdAt: minutesAgo(15) },
      { userId: maya.id, actorId: tanvir.id, type: "follow", readAt: minutesAgo(24 * 60), createdAt: minutesAgo(24 * 80) },
      { userId: maya.id, actorId: nabila.id, type: "space_post", spaceId: spPhoto.id, spaceName: "Photography", postId: p9.id, postPreview: "My desk is 40% camera gear at this point…", readAt: minutesAgo(300), createdAt: minutesAgo(360) },
      { userId: rafid.id, actorId: maya.id, type: "reaction", postId: p3.id, preview: "Support", readAt: minutesAgo(500), createdAt: minutesAgo(700) },
    ],
  });

  const counts = {
    users: await db.user.count(),
    posts: await db.post.count(),
    comments: await db.comment.count(),
    reactions: await db.reaction.count(),
    spaces: await db.space.count(),
    moments: await db.moment.count(),
    notifications: await db.notification.count(),
  };
  console.log("Seed complete:", counts);
  console.log(`Demo login → maya@kivo.app / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
