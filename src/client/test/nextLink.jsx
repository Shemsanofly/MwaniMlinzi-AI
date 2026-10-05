import { forwardRef } from 'react';
import { useRouter } from './nextNavigation.jsx';

const Link = forwardRef(function Link({ href, replace, prefetch: _p, scroll: _s, onClick, children, ...rest }, ref) {
  const router = useRouter();
  return (
    <a ref={ref} href={href} onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) { e.preventDefault(); (replace ? router.replace : router.push)(href); } }} {...rest}>
      {children}
    </a>
  );
});
export default Link;
