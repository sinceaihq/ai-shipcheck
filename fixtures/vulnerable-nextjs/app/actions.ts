'use server';

import { prisma } from '../lib/db';

export async function updateProfile(formData: FormData) {
  const id = String(formData.get('id'));
  await prisma.profile.update({
    where: { id },
    data: { displayName: String(formData.get('displayName')) },
  });
}
