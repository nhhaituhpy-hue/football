'use client';

import React from 'react';
import Image from 'next/image';

/**
 * Football3D - Quả bóng World Cup 2026 3D xoay tròn
 * Dùng hình ảnh 3D render thực tế với CSS animation xoay liên tục.
 * Bóng sẽ lơ lửng (float) và xoay (spin) tạo cảm giác 3D sống động.
 */
export default function Football3D({ size = 44 }: { size?: number }) {
  return (
    <div
      className="football-3d-wrapper"
      style={{
        width: size,
        height: size,
        perspective: '600px',
      }}
    >
      <div
        className="football-3d-spinner"
        style={{
          width: size,
          height: size,
        }}
      >
        <Image
          src="/football-3d.png"
          alt="World Cup 2026 Ball"
          width={size * 2}
          height={size * 2}
          className="football-3d-image"
          style={{
            width: size,
            height: size,
          }}
          priority
        />
      </div>
    </div>
  );
}
