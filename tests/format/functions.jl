function f(x::Int,y=2;k=3,kw...) where {T<:Real}
  x+y
end
function g end
f(x)=x^2
f(x::T) where T = x
function (a::A)(x)
    a.v*x
end
h(x; y = 1) = x + y
function long_function_name(argument_number_one, argument_number_two; keyword_argument = 1)
    return nothing
end
macro m(ex)
  esc(ex)
end
x -> x + 1
(x, y) -> x * y
map(x->x^2, xs)
