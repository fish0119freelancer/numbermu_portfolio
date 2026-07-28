'use client';

import Image from 'next/image';
import { useEditableData } from '../_components/useEditableData';
import { profile as defaultProfile } from '../../data/about';

export default function AboutPage() {
  const { items: profile } = useEditableData('profileData', defaultProfile, 'object');
  const avatar = profile?.avatar;
  const bio = Array.isArray(profile?.bio) ? profile.bio : [];
  const links = Array.isArray(profile?.links) ? profile.links : [];
  const email = profile?.email || '';
  const isInlineImage = avatar?.startsWith('data:') || avatar?.toLowerCase().endsWith('.gif');

  return (
    <section className="section-wrapper">
      <div className="about-layout">
        <div className="about-avatar">
          {avatar ? (
            isInlineImage ? (
              <img src={avatar} alt="avatar" />
            ) : (
              <Image src={avatar} alt="avatar" fill sizes="260px" />
            )
          ) : null}
        </div>
        <div className="about-text">
          {email ? (
            <p className="about-email">
              <a href={`mailto:${email}`}><strong>{email}</strong></a>
            </p>
          ) : null}
          {bio.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {links.map((link) => (
            <p className="about-link" key={link.href}>
              <a href={link.href} target="_blank" rel="noreferrer noopener">
                <strong>{link.label}</strong>
              </a>
              {link.description ? (
                <>
                  <br />
                  {link.description}
                </>
              ) : null}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
