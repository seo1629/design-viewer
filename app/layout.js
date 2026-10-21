import './globals.css';

export const metadata = {
  title: 'Design viewer',
  description: '여러 명이 남긴 설계가 DB에 쌓인다',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
