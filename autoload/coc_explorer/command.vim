function! coc_explorer#command#generate(...)
  let cmd = 'CocCommand explorer'
  if a:0 >= 1
    for [key, value] in items(a:1)
      if value is v:true
        let cmd .= ' --' . key
      elseif value is v:false
        let cmd .= ' --no-' . key
      else
        let cmd .= ' --' . key . '=' . fnameescape(value)
      endif
    endfor
  endif
  if a:0 >= 2
    let cmd .= ' ' . a:2
  endif
  return cmd . '<CR>'
endfunction
