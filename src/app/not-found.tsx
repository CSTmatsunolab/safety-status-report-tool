import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <div 
      className="
        flex flex-col justify-center items-center 
        min-h-screen text-center p-5
      "
    >
      <Image 
        src="/icon.png"
        alt="ページが見つかりません" 
        width={300}
        height={300}
        className="mb-5"
      />
      
      <h2 className="text-4xl font-bold">
        ページが見つかりません (404)
      </h2>
      
      <p className="text-xl mt-2">
        お探しのページは存在しないか、移動された可能性があります。
      </p>
      
      <div className="mt-5">
        <Link 
          href="/"
          className="text-lg text-blue-600 dark:text-blue-400 no-underline font-bold hover:underline"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}